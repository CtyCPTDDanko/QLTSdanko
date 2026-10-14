import prisma from '../utils/prisma';
import { AuditService } from './audit.service';
import { parseAndNormalizeLocation } from '../utils/location.util';
import { generateDocumentNo } from '../utils/document';

type ChildVariantInput = {
  color?: string;
  description?: string;
  identifyingFeature?: string;
};

type ToolSplitInput = {
  quantity: number;
  toLocation: string;
  childDetails?: ChildVariantInput[];
};

const parseJsonObject = (value?: string | null): Record<string, any> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const compactVariant = (variant: ChildVariantInput = {}) => ({
  color: variant.color?.trim() || null,
  description: variant.description?.trim() || null,
  identifyingFeature: variant.identifyingFeature?.trim() || null
});

const toolActionLabels: Record<string, string> = {
  CREATE: 'Nhập mới',
  IMPORT: 'Nhập mới',
  ASSIGN: 'Bàn giao',
  HANDOVER: 'Bàn giao',
  TRANSFER: 'Điều chuyển',
  USE: 'Bàn giao',
  ALLOCATE: 'Bàn giao',
  RECALL: 'Thu hồi',
  DAMAGE: 'Báo hỏng',
  REPAIR: 'Gửi sửa chữa',
  REPAIR_COMPLETE: 'Hoàn thành sửa chữa',
  LOST: 'Mất',
  LIQUIDATE: 'Thanh lý',
  DESTROY: 'Hủy',
  UPDATE: 'Cập nhật',
  DELETE: 'Xóa',
  ADJUST: 'Điều chỉnh',
  STATUS_LOCATION_USER_CHANGE: 'Thay đổi trạng thái'
};

const normalizeToolAction = (action?: string | null) => {
  if (!action) return 'Cập nhật';
  return toolActionLabels[action] || action;
};

export class ToolService {
  private static readonly CATEGORY_CHANGE_BLOCK_MESSAGE = 'CCDC đang có nghiệp vụ chưa hoàn tất. Vui lòng hoàn tất hoặc hủy nghiệp vụ liên quan trước khi đổi nhóm.';

  private static resolveToolCategoryCode(category?: string | null) {
    let nhomCode = 'GEN';
    if (category) {
      const parentCat = category.split('-')[0].trim().toLowerCase();
      if (parentCat.includes('decor')) nhomCode = 'DECOR';
      else if (parentCat.includes('event')) nhomCode = 'EVENT';
      else if (parentCat.includes('fb') || parentCat.includes('tiệc') || parentCat.includes('f&b')) nhomCode = 'FNB';
      else if (parentCat.includes('nội thất')) nhomCode = 'FURNITURE';
      else if (parentCat.includes('bất động sản') || parentCat.includes('bđs')) nhomCode = 'BDS';
      else if (parentCat.includes('marketing')) nhomCode = 'MKT';
      else if (parentCat.includes('media')) nhomCode = 'MEDIA';
      else if (parentCat.includes('kỹ thuật')) nhomCode = 'TECH';
      else if (parentCat.includes('kho vận')) nhomCode = 'KHO';
      else if (parentCat.includes('cntt') || parentCat.includes('it')) nhomCode = 'CNTT';
      else if (parentCat.includes('tiêu hao')) nhomCode = 'CONSUMABLE';
      else if (parentCat.includes('merchandise')) nhomCode = 'MERCH';
      else if (parentCat.includes('branding')) nhomCode = 'BRAND';
      else if (parentCat.includes('dịch vụ vận hành')) nhomCode = 'OPS';
    }
    return nhomCode;
  }

  private static resolveToolManagementCode(managementType?: string | null) {
    const type = String(managementType || 'INDIVIDUAL').toUpperCase();
    if (type === 'QUANTITY') return 'SL';
    if (type === 'BUNDLE') return 'CB';
    return 'I';
  }

  private static composeToolCode(params: {
    baseCode: string;
    runningNoText: string;
    managementType?: string | null;
    physicalQuantity?: number | null;
  }) {
    const typeCode = this.resolveToolManagementCode(params.managementType);
    const quantity = Math.max(1, Math.floor(Number(params.physicalQuantity || 1)));
    const quantitySuffix = typeCode === 'I' ? '' : `-Q${quantity}`;
    return `${params.baseCode}.${typeCode}.${params.runningNoText}${quantitySuffix}`;
  }

  private static assertCanChangeToolCategory(user?: any) {
    const permissions = new Set<string>(user?.permissions || []);
    const roles = (user?.roles || []).map((role: string) => String(role).toUpperCase());
    const roleText = roles.join(' ');
    const allowed = permissions.has('TOOL_UPDATE')
      || permissions.has('TOOL_MANAGE')
      || permissions.has('CCDC_MANAGE')
      || roles.includes('SUPER_ADMIN')
      || roles.includes('ADMIN')
      || roleText.includes('MANAGER')
      || roleText.includes('QUAN_LY')
      || roleText.includes('KE_TOAN')
      || roleText.includes('FINANCE')
      || roleText.includes('ACCOUNTING');
    if (!allowed) throw new Error('Bạn không có quyền đổi nhóm CCDC.');
  }

  private static async getOpenToolOperationLabels(tx: any, toolId: number) {
    const checks: Array<[string, Promise<number>]> = [
      ['Bàn giao/điều chuyển/thu hồi', tx.toolHandoverItem.count({ where: { toolId, handoverDocument: { status: { in: ['DRAFT', 'PENDING_CONFIRMATION'] } } } })],
      ['Kiểm kê', tx.toolInventoryItem.count({ where: { toolId, inventoryCheck: { status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] } } } })],
      ['Lô kiểm kê', tx.toolInventoryDetail.count({ where: { toolId, session: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } })],
      ['Báo hỏng/sửa chữa', tx.toolDamageReportItem.count({ where: { toolId, damageReport: { OR: [{ status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS', 'PENDING'] } }, { approvalStatus: 'PENDING' }] } } })],
      ['Phiếu sửa chữa', tx.toolRepairTicket.count({ where: { toolId, status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS', 'PENDING'] } } })],
      ['Báo mất', tx.toolLostReport.count({ where: { toolId, approvalStatus: 'PENDING' } })],
      ['Thanh lý', tx.toolLiquidationItem.count({ where: { toolId, liquidationRecord: { status: { in: ['DRAFT', 'PENDING', 'PENDING_APPROVAL', 'OPEN', 'IN_PROGRESS'] } } } })],
      ['Sửa chữa mã con', tx.cCDCChildRepair.count({ where: { child: { parentCcdcId: toolId }, status: { in: ['PENDING', 'OPEN', 'IN_PROGRESS'] } } })],
      ['Duyệt mã con', tx.cCDCApprovalRequest.count({ where: { parentId: toolId, status: 'PENDING' } })]
    ];
    const counts = await Promise.all(checks.map(([, promise]) => promise));
    return checks.map(([label], index) => counts[index] > 0 ? label : null).filter(Boolean) as string[];
  }

  private static async generateToolCodeWithCounter(params: { category?: string | null; purchaseDate?: Date | null; managementType?: string | null; physicalQuantity?: number | null }, tx: any) {
    const categoryKey = this.resolveToolCategoryCode(params.category);
    const year = params.purchaseDate ? new Date(params.purchaseDate).getFullYear() : new Date().getFullYear();
    const baseCode = `CCDC.${categoryKey}.${year}`;

    await tx.$executeRaw`
      INSERT INTO "ToolCodeCounter" ("categoryKey", "year", "currentNumber", "createdAt", "updatedAt")
      VALUES (${categoryKey}, ${year}, 0, NOW(), NOW())
      ON CONFLICT ("categoryKey", "year") DO NOTHING
    `;
    const counterRows = await tx.$queryRaw<Array<{ id: number; currentNumber: number }>>`
      SELECT "id", "currentNumber" FROM "ToolCodeCounter"
      WHERE "categoryKey" = ${categoryKey} AND "year" = ${year}
      FOR UPDATE
    `;
    if (!counterRows.length) throw new Error('Không thể khóa bộ đếm mã CCDC.');

    let nextNumber = counterRows[0].currentNumber;
    for (let attempt = 0; attempt < 50; attempt++) {
      nextNumber += 1;
      const runningNoText = nextNumber.toString().padStart(5, '0');
      const toolCode = this.composeToolCode({
        baseCode,
        runningNoText,
        managementType: params.managementType,
        physicalQuantity: params.physicalQuantity
      });
      const duplicated = await tx.toolEquipment.findUnique({ where: { toolCode }, select: { id: true } });
      if (!duplicated) {
        await tx.toolCodeCounter.update({ where: { id: counterRows[0].id }, data: { currentNumber: nextNumber } });
        return { runningNo: nextNumber, runningNoText, toolCode };
      }
    }
    throw new Error('Không thể sinh mã CCDC mới không trùng. Vui lòng thử lại.');
  }

  /**
   * Generates CCDC tool codes.
   * New format: CCDC.{NHOM}.{NAM}.{I|SL|CB}.{STT}[-Q{quantity}]
   * Legacy codes are kept untouched and still counted for the running number.
   */
  static async generateToolCodes(
    params: {
      category?: string | null;
      branchName?: string | null;
      purchaseDate?: Date | null;
      managementType?: string | null;
      physicalQuantity?: number | null;
      quantity: number;
    },
    txClient?: any
  ) {
    const client = txClient || prisma;
    const { category, branchName, purchaseDate, managementType, physicalQuantity, quantity } = params;

    // 1. Resolve NHOM code from Category (e.g. "Event - Âm thanh" -> "EVENT")
    const nhomCode = this.resolveToolCategoryCode(category);

    // 2. Resolve DONVI code from Branch Name (e.g. "Hà Nội" -> "HN")
    let donviCode = 'HQ';
    if (branchName) {
      const branchClean = branchName.trim().toLowerCase();
      if (branchClean.includes('hà nội')) donviCode = 'HN';
      else if (branchClean.includes('hồ chí minh') || branchClean.includes('hcm')) donviCode = 'HCM';
      else if (branchClean.includes('đà nẵng')) donviCode = 'DN';
      else if (branchClean.includes('thái nguyên')) donviCode = 'TN';
      else if (branchClean.includes('bắc ninh')) donviCode = 'BN';
      else if (branchClean.includes('tuyên quang')) donviCode = 'TQ';
      else if (branchClean.includes('thanh hóa')) donviCode = 'TH';
      else if (branchClean.includes('phú thọ')) donviCode = 'PT';
      else if (branchClean.includes('hà nam')) donviCode = 'HNM';
      else {
        // Fallback: take first letters of each word
        const cleanName = branchName.trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9\s]/g, '');
        const initials = cleanName.split(/\s+/).map(w => w[0]).join('').toUpperCase();
        donviCode = initials.substring(0, 4) || 'GEN';
      }
    }

    // 3. Resolve year
    const year = purchaseDate ? new Date(purchaseDate).getFullYear() : new Date().getFullYear();
    const baseCode = `CCDC.${nhomCode}.${year}`;

    const execute = async (tx: any) => {
      // Find latest STT in the database using startsWith
      const existingTools = await tx.toolEquipment.findMany({
        where: {
          toolCode: {
            startsWith: `${baseCode}.`
          }
        },
        select: {
          toolCode: true
        }
      });

      let maxSeq = 0;
      for (const tool of existingTools) {
        const parts = tool.toolCode.split('.');
        const typedSeq = parts.length >= 5 ? parts[4] : '';
        const lastPart = parts[parts.length - 1];
        const num = parseInt(typedSeq || lastPart, 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }

      // Also check documentCounter
      const counterKey = `TOOL_CODE_${nhomCode}_${year}`;
      let counter = await tx.documentCounter.findUnique({
        where: { documentType: counterKey }
      });

      if (!counter) {
        counter = await tx.documentCounter.create({
          data: { documentType: counterKey, lastNumber: 0 }
        });
      }

      const startNumber = Math.max(counter.lastNumber, maxSeq) + 1;
      const endNumber = startNumber + quantity - 1;

      await tx.documentCounter.update({
        where: { id: counter.id },
        data: { lastNumber: endNumber }
      });

      const codes = [];
      for (let i = startNumber; i <= endNumber; i++) {
        const seqText = i.toString().padStart(5, '0');
        const toolCode = this.composeToolCode({
          baseCode,
          runningNoText: seqText,
          managementType,
          physicalQuantity
        });
        codes.push({ runningNo: i, runningNoText: seqText, toolCode });
      }

      return codes;
    };

    if (txClient) {
      return await execute(txClient);
    } else {
      return await prisma.$transaction(async (tx) => {
        return await execute(tx);
      }, { timeout: 30000 });
    }
  }

  static async generateSingleToolCode(
    params: {
      category?: string | null;
      branchName?: string | null;
      purchaseDate?: Date | null;
      managementType?: string | null;
      physicalQuantity?: number | null;
    },
    txClient?: any
  ) {
    const codes = await this.generateToolCodes({ ...params, quantity: 1 }, txClient);
    return codes[0];
  }

  /**
   * Get CCDC dashboard counts
   */
  static async getDashboardSummary() {
    const [
      totalTools,
      // Non-QUANTITY type counts (by status field)
      nonQtyUsing,
      nonQtyInStock,
      nonQtyDamaged,
      nonQtyLost,
      nonQtyLiquidated,
      // QUANTITY type counts (by stock data)
      qtyUsing,
      qtyInStock,
      qtyDamaged,
      qtyLost,
      qtyLiquidated,
      // Financial
      totalValue,
      recentLogs,
      // Physical quantity aggregates from ToolStock
      stockAggregates,
      totalQuantitySum
    ] = await Promise.all([
      // Total all records
      prisma.toolEquipment.count({ where: { isDeleted: false } }),

      // Non-QUANTITY: use status field directly
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: { not: 'QUANTITY' }, status: 'USING' } }),
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: { not: 'QUANTITY' }, status: 'IN_STOCK' } }),
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: { not: 'QUANTITY' }, status: 'DAMAGED' } }),
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: { not: 'QUANTITY' }, status: 'LOST' } }),
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: { not: 'QUANTITY' }, status: 'LIQUIDATED' } }),

      // QUANTITY type: use stock data (more accurate)
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: 'QUANTITY', stocks: { some: { quantityUsing: { gt: 0 } } } } }),
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: 'QUANTITY', stocks: { some: { quantityAvailable: { gt: 0 } } } } }),
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: 'QUANTITY', stocks: { some: { OR: [{ quantityBroken: { gt: 0 } }, { quantityRepairing: { gt: 0 } }] } } } }),
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: 'QUANTITY', stocks: { some: { quantityLost: { gt: 0 } } } } }),
      prisma.toolEquipment.count({ where: { isDeleted: false, managementType: 'QUANTITY', status: 'LIQUIDATED' } }),

      // Financial
      prisma.toolEquipment.aggregate({
        where: { isDeleted: false },
        _sum: { purchasePrice: true }
      }),
      prisma.auditLog.findMany({
        where: { entityType: { in: ['TOOL', 'TOOL_EQUIPMENT'] } },
        take: 10,
        orderBy: { createdAt: 'desc' }
      }),
      // Physical quantity aggregates from ToolStock records
      prisma.toolStock.aggregate({
        _sum: {
          quantityAvailable: true,
          quantityUsing: true,
          quantityBroken: true,
          quantityRepairing: true,
          quantityLost: true,
          quantityDestroyed: true,
          quantityTransit: true
        }
      }),
      // Total physical quantity from ToolEquipment.quantity (QUANTITY type)
      prisma.toolEquipment.aggregate({
        where: { isDeleted: false, managementType: 'QUANTITY' },
        _sum: { quantity: true }
      })
    ]);

    const stockSums = stockAggregates._sum;
    const totalAvailable = stockSums.quantityAvailable || 0;
    const totalUsing = stockSums.quantityUsing || 0;
    const totalBroken = stockSums.quantityBroken || 0;
    const totalRepairing = stockSums.quantityRepairing || 0;
    const totalLostQty = stockSums.quantityLost || 0;
    const totalDestroyed = stockSums.quantityDestroyed || 0;
    const totalTransit = stockSums.quantityTransit || 0;
    const totalQuantity = totalQuantitySum._sum.quantity || 0;

    // Combined counts (INDIVIDUAL + QUANTITY)
    const using      = nonQtyUsing      + qtyUsing;
    const inStock    = nonQtyInStock    + qtyInStock;
    const damaged    = nonQtyDamaged    + qtyDamaged;
    const lost       = nonQtyLost       + qtyLost;
    const liquidated = nonQtyLiquidated + qtyLiquidated;

    return {
      totalTools,
      using,
      inStock,
      damaged,
      lost,
      liquidated,
      totalValue: totalValue._sum.purchasePrice || 0,
      recentLogs,
      // Stock quantity aggregates for QUANTITY-type CCDC
      totalQuantity,
      totalAvailable,
      totalUsing,
      totalBroken,
      totalRepairing,
      totalLostQty,
      totalDestroyed,
      totalTransit
    };
  }


  /**
   * Create new Tool
   */
  static async createTool(data: any, performedBy: string, txClient?: any) {
    const execute = async (tx: any) => {
      // Normalize location
      if (data.locationName) {
        const norm = parseAndNormalizeLocation(data.locationName);
        data.locationName = norm.fullFormatted;
        if (norm.city) data.cityName = norm.city;
        if (norm.project) data.projectName = norm.project;
      }

      // Auto generate code if missing
      if (!data.toolCode) {
        const gen = await this.generateSingleToolCode({
          category: data.category,
          branchName: data.branchName,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
          managementType: data.managementType || 'INDIVIDUAL',
          physicalQuantity: data.quantity ? Number(data.quantity) : 1
        }, tx);
        data.toolCode = gen.toolCode;
      }

      const tool = await tx.toolEquipment.create({
        data: {
          toolCode: data.toolCode,
          toolName: data.toolName,
          category: data.category,
          quantity: data.quantity ? Number(data.quantity) : 1,
          unit: data.unit || 'Cái',
          purchasePrice: data.purchasePrice ? Number(data.purchasePrice) : 0,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
          supplierName: data.supplierName,
          currentUserName: data.currentUserName,
          departmentName: data.departmentName,
          locationName: data.locationName,
          cityName: data.cityName,
          projectName: data.projectName,
          status: data.status || 'IN_STOCK',
          handoverDate: data.handoverDate ? new Date(data.handoverDate) : null,
          note: data.note,
          attachments: data.attachments,
          initialCondition: data.initialCondition,
          industryAttributesJson: data.industryAttributesJson,

          // CCDC Enterprise fields
          managementType: data.managementType || 'INDIVIDUAL',
          vat: data.vat ? Number(data.vat) : 0,
          shippingInstallCost: data.shippingInstallCost ? Number(data.shippingInstallCost) : 0,
          totalAmount: data.totalAmount ? Number(data.totalAmount) : 0,
          fundingSource: data.fundingSource || 'MUA_MOI',
          expectedUsefulLife: data.expectedUsefulLife ? Number(data.expectedUsefulLife) : null,
          expectedResidualValue: data.expectedResidualValue ? Number(data.expectedResidualValue) : null,
          companyName: data.companyName || null,
          branchName: data.branchName || null,
          buildingName: data.buildingName || null,
          floorName: data.floorName || null,
          areaName: data.areaName || null,
          specificLocation: data.specificLocation || null,
          operationalSpecsJson: data.operationalSpecsJson || null,
          filesJson: data.filesJson || null,
          warrantyInfoJson: data.warrantyInfoJson || null,
          customFieldsJson: data.customFieldsJson || null
        }
      });

      // QUANTITY type stock initialization
      if (tool.managementType === 'QUANTITY') {
        const loc = tool.locationName || 'KHO CCDC';
        await tx.toolStock.create({
          data: {
            toolId: tool.id,
            locationName: loc,
            quantityAvailable: tool.quantity,
            quantityUsing: 0,
            quantityBroken: 0,
            quantityLost: 0,
            quantityDestroyed: 0
          }
        });

        await tx.toolBatch.create({
          data: {
            toolId: tool.id,
            batchNumber: 'LOT001',
            quantity: tool.quantity,
            purchasePrice: tool.purchasePrice || 0,
            purchaseDate: tool.purchaseDate,
            supplierName: tool.supplierName
          }
        });

        await tx.toolStockTransaction.create({
          data: {
            toolId: tool.id,
            type: 'IMPORT',
            quantity: tool.quantity,
            toLocation: loc,
            performedBy,
            note: 'Nhập mới CCDC'
          }
        });
      }

      // Write initial history
      await tx.toolHistory.create({
        data: {
          toolId: tool.id,
          toolCode: tool.toolCode,
          eventTime: new Date(),
          actionType: 'CREATE',
          newStatus: tool.status,
          newUserName: tool.currentUserName,
          newDepartmentName: tool.departmentName,
          newLocationName: tool.locationName,
          newCityName: tool.cityName,
          newNote: 'Khởi tạo CCDC mới'
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: tool.id,
        action: 'CREATE',
        details: { toolCode: tool.toolCode, toolName: tool.toolName },
        performedBy,
        tx
      });

      return tool;
    };

    if (txClient) {
      return await execute(txClient);
    } else {
      return await prisma.$transaction(async (tx) => {
        return await execute(tx);
      });
    }
  }

  /**
   * Create multiple tools in a single transaction (Bulk create)
   */
  static async createToolsBulk(dataList: any[], performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const results = [];
      for (const data of dataList) {
        const tool = await this.createTool(data, performedBy, tx);
        results.push(tool);
      }
      return results;
    }, { timeout: 60000 });
  }

  /**
   * Update Tool details
   */
  static async updateTool(id: number, updates: any, performedBy: string, reason?: string, actor?: any) {
    return await prisma.$transaction(async (tx) => {
      const { reason: payloadReason, id: _id, createdAt: _createdAt, updatedAt: _updatedAt, idempotencyKey, ...safeUpdates } = updates || {};
      updates = safeUpdates;
      reason = reason || payloadReason;

      const oldTool = await tx.toolEquipment.findUnique({ where: { id } });
      if (!oldTool) throw new Error('Không tìm thấy CCDC.');

      delete updates.toolCode;

      const categoryChanged = typeof updates.category === 'string'
        && updates.category.trim()
        && updates.category.trim() !== oldTool.category;

      let categoryChangeContext: any = null;
      if (categoryChanged) {
        this.assertCanChangeToolCategory(actor);
        const requestKey = String(idempotencyKey || '').trim();
        if (!requestKey) throw new Error('Thiếu idempotencyKey khi đổi nhóm CCDC.');

        const newCategory = updates.category.trim();
        const existingRequest = await tx.toolCategoryChangeRequest.findUnique({
          where: { toolId_idempotencyKey: { toolId: id, idempotencyKey: requestKey } }
        });
        if (existingRequest) {
          if (
            existingRequest.status === 'COMPLETED'
            && existingRequest.newCategory === oldTool.category
            && existingRequest.newToolCode === oldTool.toolCode
          ) {
            return oldTool;
          }
          if (existingRequest.newCategory !== newCategory || existingRequest.oldToolCode !== oldTool.toolCode) {
            throw new Error('Yêu cầu đổi nhóm CCDC không khớp với lần gửi trước.');
          }
          if (existingRequest.status === 'COMPLETED' && existingRequest.newToolCode) return oldTool;
        }

        const openOperations = await this.getOpenToolOperationLabels(tx, id);
        if (openOperations.length > 0) throw new Error(this.CATEGORY_CHANGE_BLOCK_MESSAGE);

        const request = existingRequest || await tx.toolCategoryChangeRequest.create({
          data: {
            toolId: id,
            oldCategory: oldTool.category,
            newCategory,
            oldToolCode: oldTool.toolCode,
            idempotencyKey: requestKey,
            reason: reason || null,
            requestedBy: performedBy
          }
        });
        const generated = await this.generateToolCodeWithCounter({
          category: newCategory,
          purchaseDate: updates.purchaseDate ? new Date(updates.purchaseDate) : oldTool.purchaseDate,
          managementType: updates.managementType || oldTool.managementType,
          physicalQuantity: updates.quantity ? Number(updates.quantity) : oldTool.quantity
        }, tx);

        updates.category = newCategory;
        updates.toolCode = generated.toolCode;
        categoryChangeContext = {
          requestId: request.id,
          idempotencyKey: requestKey,
          oldCategory: oldTool.category,
          newCategory,
          oldToolCode: oldTool.toolCode,
          newToolCode: generated.toolCode
        };
      }

      // Normalize location
      if (updates.locationName) {
        const norm = parseAndNormalizeLocation(updates.locationName);
        updates.locationName = norm.fullFormatted;
        if (norm.city) updates.cityName = norm.city;
        if (norm.project) updates.projectName = norm.project;
      }

      // Convert date strings and numbers safely
      if (updates.purchaseDate) updates.purchaseDate = new Date(updates.purchaseDate);
      if (updates.handoverDate) updates.handoverDate = new Date(updates.handoverDate);
      if (updates.quantity !== undefined && updates.quantity !== null) updates.quantity = Number(updates.quantity);
      if (updates.purchasePrice !== undefined && updates.purchasePrice !== null) updates.purchasePrice = Number(updates.purchasePrice);
      if (updates.vat !== undefined && updates.vat !== null) updates.vat = Number(updates.vat);
      if (updates.shippingInstallCost !== undefined && updates.shippingInstallCost !== null) updates.shippingInstallCost = Number(updates.shippingInstallCost);
      if (updates.totalAmount !== undefined && updates.totalAmount !== null) updates.totalAmount = Number(updates.totalAmount);
      if (updates.expectedUsefulLife !== undefined && updates.expectedUsefulLife !== null) updates.expectedUsefulLife = Number(updates.expectedUsefulLife);
      if (updates.expectedResidualValue !== undefined && updates.expectedResidualValue !== null) updates.expectedResidualValue = Number(updates.expectedResidualValue);

      const updated = await tx.toolEquipment.update({
        where: { id },
        data: updates
      });

      // Log changes to ToolHistory
      const changes: Record<string, { old: any; new: any }> = {};
      const fieldsToTrack = [
        'status', 'currentUserName', 'departmentName', 'locationName',
        'cityName', 'projectName', 'toolName', 'purchasePrice', 'unit',
        'purchaseDate', 'supplierName', 'toolCode', 'category', 'note', 'industryAttributesJson',
        'managementType', 'vat', 'shippingInstallCost', 'totalAmount', 'fundingSource',
        'expectedUsefulLife', 'expectedResidualValue', 'companyName', 'branchName',
        'buildingName', 'floorName', 'areaName', 'specificLocation',
        'operationalSpecsJson', 'filesJson', 'warrantyInfoJson', 'customFieldsJson'
      ];

      for (const field of fieldsToTrack) {
        const oldVal = (oldTool as any)[field] instanceof Date ? (oldTool as any)[field].toISOString() : (oldTool as any)[field];
        const newVal = (updated as any)[field] instanceof Date ? (updated as any)[field].toISOString() : (updated as any)[field];
        
        if (oldVal !== newVal) {
          changes[field] = { old: oldVal, new: newVal };
        }
      }

      if (Object.keys(changes).length > 0) {
        await tx.toolHistory.create({
          data: {
            toolId: updated.id,
            toolCode: updated.toolCode,
            eventTime: new Date(),
            actionType: 'UPDATE',
            oldStatus: oldTool.status,
            newStatus: updated.status,
            oldUserName: oldTool.currentUserName,
            newUserName: updated.currentUserName,
            oldLocationName: oldTool.locationName,
            newLocationName: updated.locationName,
            oldDepartmentName: oldTool.departmentName,
            newDepartmentName: updated.departmentName,
            oldNote: categoryChangeContext
              ? `Đổi nhóm CCDC: ${categoryChangeContext.oldCategory} (${categoryChangeContext.oldToolCode}) -> ${categoryChangeContext.newCategory} (${categoryChangeContext.newToolCode})`
              : (reason || 'Cập nhật thông tin chi tiết'),
            newNote: categoryChangeContext ? 'Mã con CCDC giữ nguyên, liên kết theo parentCcdcId.' : undefined,
          }
        });

        if (categoryChangeContext) {
          await tx.toolCategoryChangeRequest.update({
            where: { id: categoryChangeContext.requestId },
            data: {
              newToolCode: categoryChangeContext.newToolCode,
              status: 'COMPLETED',
              completedAt: new Date()
            }
          });
        }

        await AuditService.log({
          entityType: 'TOOL_EQUIPMENT',
          entityId: updated.id,
          action: 'UPDATE',
          details: {
            changes,
            reason: reason || null,
            categoryChange: categoryChangeContext ? {
              oldCategory: categoryChangeContext.oldCategory,
              newCategory: categoryChangeContext.newCategory,
              oldToolCode: categoryChangeContext.oldToolCode,
              newToolCode: categoryChangeContext.newToolCode,
              idempotencyKey: categoryChangeContext.idempotencyKey,
              childCodesUnchanged: true
            } : undefined
          },
          performedBy,
          tx
        });
      }

      return updated;
    });
  }

  /**
   * Soft delete tool
   */
  static async deleteTool(id: number, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const tool = await tx.toolEquipment.findUnique({ where: { id } });
      if (!tool) throw new Error('Không tìm thấy CCDC.');

      await tx.toolEquipment.update({
        where: { id },
        data: { isDeleted: true }
      });

      await tx.toolHistory.create({
        data: {
          toolId: tool.id,
          toolCode: tool.toolCode,
          eventTime: new Date(),
          actionType: 'DELETE',
          oldStatus: tool.status,
          newStatus: 'DELETED',
          oldNote: 'Xóa CCDC'
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: tool.id,
        action: 'DELETE',
        details: { toolCode: tool.toolCode, toolName: tool.toolName },
        performedBy,
        tx
      });
    });
  }

  /**
   * Get CCDC List with filters
   */
  static async getTools(params: {
    status?: string;
    category?: string;
    departmentName?: string;
    locationName?: string;
    currentUserName?: string;
    search?: string;
    managementType?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}) {
    const {
      status,
      category,
      departmentName,
      locationName,
      currentUserName,
      search,
      managementType,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = params;

    const where: any = { isDeleted: false };

    if (status && status !== 'ALL') {
      if (status === 'IN_STOCK') {
        where.OR = [
          { status: 'IN_STOCK', managementType: { not: 'QUANTITY' } },
          { managementType: 'QUANTITY', stocks: { some: { quantityAvailable: { gt: 0 } } } }
        ];
      } else if (status === 'USING') {
        where.OR = [
          { status: 'USING', managementType: { not: 'QUANTITY' } },
          { managementType: 'QUANTITY', stocks: { some: { quantityUsing: { gt: 0 } } } }
        ];
      } else if (status === 'DAMAGED') {
        where.OR = [
          { status: 'DAMAGED', managementType: { not: 'QUANTITY' } },
          { managementType: 'QUANTITY', stocks: { some: { OR: [ { quantityBroken: { gt: 0 } }, { quantityRepairing: { gt: 0 } } ] } } }
        ];
      } else if (status === 'LOST') {
        where.OR = [
          { status: 'LOST', managementType: { not: 'QUANTITY' } },
          { managementType: 'QUANTITY', stocks: { some: { quantityLost: { gt: 0 } } } }
        ];
      } else {
        where.status = status;
      }
    }
    if (category && category !== 'ALL') where.category = category;
    if (departmentName && departmentName !== 'ALL') where.departmentName = departmentName;
    if (locationName && locationName !== 'ALL') where.locationName = { contains: locationName };
    if (currentUserName && currentUserName !== 'ALL') where.currentUserName = { contains: currentUserName };
    if (managementType && managementType !== 'ALL') where.managementType = managementType;

    if (search) {
      where.OR = [
        { toolCode: { contains: search, mode: 'insensitive' } },
        { toolName: { contains: search, mode: 'insensitive' } },
        { currentUserName: { contains: search, mode: 'insensitive' } },
        { departmentName: { contains: search, mode: 'insensitive' } },
        { locationName: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { supplierName: { contains: search, mode: 'insensitive' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.toolEquipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          stocks: true
        }
      }),
      prisma.toolEquipment.count({ where })
    ]);

    return { items, total, page, limit };
  }

  /**
   * Get detailed profile of CCDC
   */
  static async getToolDetail(id: number) {
    return await prisma.toolEquipment.findUnique({
      where: { id },
      include: {
        assignments: { orderBy: { createdAt: 'desc' } },
        handoverItems: {
          include: { handoverDocument: true },
          orderBy: { id: 'desc' }
        },
        repairTickets: { orderBy: { createdAt: 'desc' } },
        damageReports: { include: { damageReport: true } },
        lostReports: { orderBy: { createdAt: 'desc' } },
        liquidations: { include: { liquidationRecord: true } },
        inventoryItems: { include: { inventoryCheck: true }, orderBy: { checkedAt: 'desc' } },
        histories: { orderBy: { eventTime: 'desc' } },
        stocks: true,
        batches: { orderBy: { createdAt: 'asc' } },
        stockTransactions: { orderBy: { createdAt: 'desc' } },
        invoiceBatch: true,
        invoiceLine: true
      }
    });
  }

  static async getToolHistoryAudit(params: {
    dateFrom?: string;
    dateTo?: string;
    actionType?: string;
    keyword?: string;
    actor?: string;
    location?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const dateWhere: any = {};
    if (params.dateFrom) dateWhere.gte = new Date(params.dateFrom);
    if (params.dateTo) {
      const endDate = new Date(params.dateTo);
      endDate.setHours(23, 59, 59, 999);
      dateWhere.lte = endDate;
    }

    const historyWhere: any = {};
    const stockWhere: any = {};
    if (Object.keys(dateWhere).length) {
      historyWhere.eventTime = dateWhere;
      stockWhere.createdAt = dateWhere;
    }
    if (params.actionType && params.actionType !== 'ALL') {
      historyWhere.actionType = params.actionType;
      stockWhere.type = params.actionType;
    }
    if (params.keyword) {
      historyWhere.OR = [
        { toolCode: { contains: params.keyword, mode: 'insensitive' } },
        { toolNameSnapshot: { contains: params.keyword, mode: 'insensitive' } },
        { newUserName: { contains: params.keyword, mode: 'insensitive' } },
        { oldUserName: { contains: params.keyword, mode: 'insensitive' } },
        { newDepartmentName: { contains: params.keyword, mode: 'insensitive' } },
        { oldDepartmentName: { contains: params.keyword, mode: 'insensitive' } },
        { newLocationName: { contains: params.keyword, mode: 'insensitive' } },
        { oldLocationName: { contains: params.keyword, mode: 'insensitive' } },
        { newNote: { contains: params.keyword, mode: 'insensitive' } },
        { oldNote: { contains: params.keyword, mode: 'insensitive' } },
        { tool: { toolName: { contains: params.keyword, mode: 'insensitive' } } }
      ];
      stockWhere.OR = [
        { note: { contains: params.keyword, mode: 'insensitive' } },
        { fromLocation: { contains: params.keyword, mode: 'insensitive' } },
        { toLocation: { contains: params.keyword, mode: 'insensitive' } },
        { performedBy: { contains: params.keyword, mode: 'insensitive' } },
        { tool: { toolCode: { contains: params.keyword, mode: 'insensitive' } } },
        { tool: { toolName: { contains: params.keyword, mode: 'insensitive' } } },
        { tool: { supplierName: { contains: params.keyword, mode: 'insensitive' } } }
      ];
    }
    if (params.actor) {
      stockWhere.performedBy = { contains: params.actor, mode: 'insensitive' };
      historyWhere.source = { contains: params.actor, mode: 'insensitive' };
    }
    if (params.location) {
      historyWhere.OR = [
        ...(historyWhere.OR || []),
        { oldLocationName: { contains: params.location, mode: 'insensitive' } },
        { newLocationName: { contains: params.location, mode: 'insensitive' } }
      ];
      stockWhere.OR = [
        ...(stockWhere.OR || []),
        { fromLocation: { contains: params.location, mode: 'insensitive' } },
        { toLocation: { contains: params.location, mode: 'insensitive' } }
      ];
    }

    const [histories, stockTransactions] = await Promise.all([
      prisma.toolHistory.findMany({
        where: historyWhere,
        include: { tool: { include: { invoiceBatch: true } } },
        orderBy: { eventTime: 'desc' },
        take: 1000
      }),
      prisma.toolStockTransaction.findMany({
        where: stockWhere,
        include: { tool: { include: { invoiceBatch: true } } },
        orderBy: { createdAt: 'desc' },
        take: 1000
      })
    ]);

    const auditRows = [
      ...histories.map((h: any) => ({
        id: `history-${h.id}`,
        sourceType: 'TOOL_HISTORY',
        sourceId: h.id,
        toolId: h.toolId,
        toolCode: h.toolCode,
        toolName: h.tool?.toolName || h.toolNameSnapshot || '',
        serialNumber: null,
        purchaseDate: h.tool?.purchaseDate || null,
        invoiceNo: h.tool?.invoiceBatch?.invoiceNo || null,
        eventTime: h.eventTime,
        actionType: h.actionType,
        actionLabel: normalizeToolAction(h.actionType),
        before: {
          status: h.oldStatus,
          userName: h.oldUserName,
          departmentName: h.oldDepartmentName,
          locationName: h.oldLocationName,
          projectName: h.oldProjectName,
          cityName: h.oldCityName,
          note: h.oldNote
        },
        after: {
          status: h.newStatus,
          userName: h.newUserName,
          departmentName: h.newDepartmentName,
          locationName: h.newLocationName,
          projectName: h.newProjectName,
          cityName: h.newCityName,
          note: h.newNote
        },
        actor: h.source || 'SYSTEM',
        note: h.newNote || h.oldNote || '',
        attachments: []
      })),
      ...stockTransactions.map((t: any) => ({
        id: `stock-${t.id}`,
        sourceType: 'TOOL_STOCK_TRANSACTION',
        sourceId: t.id,
        toolId: t.toolId,
        toolCode: t.tool?.toolCode || '',
        toolName: t.tool?.toolName || '',
        serialNumber: null,
        purchaseDate: t.tool?.purchaseDate || null,
        invoiceNo: t.tool?.invoiceBatch?.invoiceNo || null,
        eventTime: t.createdAt,
        actionType: t.type,
        actionLabel: normalizeToolAction(t.type),
        before: { locationName: t.fromLocation, quantity: t.quantity },
        after: { locationName: t.toLocation, quantity: t.quantity },
        actor: t.performedBy,
        note: t.note || '',
        attachments: []
      }))
    ].sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime());

    const stats = {
      total: auditRows.length,
      imports: auditRows.filter(row => ['CREATE', 'IMPORT'].includes(row.actionType)).length,
      handovers: auditRows.filter(row => ['ASSIGN', 'HANDOVER', 'USE', 'ALLOCATE'].includes(row.actionType)).length,
      transfers: auditRows.filter(row => row.actionType === 'TRANSFER').length,
      recalls: auditRows.filter(row => row.actionType === 'RECALL').length,
      repairs: auditRows.filter(row => ['DAMAGE', 'REPAIR', 'REPAIR_COMPLETE'].includes(row.actionType)).length,
      liquidations: auditRows.filter(row => ['LIQUIDATE', 'DESTROY'].includes(row.actionType)).length
    };

    const skip = (page - 1) * limit;
    return {
      items: auditRows.slice(skip, skip + limit),
      stats,
      total: auditRows.length,
      page,
      limit
    };
  }

  /**
   * Export tools registry to CSV string
   */
  static async exportTools(ids?: number[]): Promise<string> {
    const where: any = { isDeleted: false };
    if (ids && ids.length > 0) {
      where.id = { in: ids };
    }

    const tools = await prisma.toolEquipment.findMany({
      where,
      orderBy: { toolCode: 'asc' }
    });

    const rows = [
      ['Mã CCDC', 'Tên CCDC', 'Nhóm CCDC', 'Số lượng', 'ĐVT', 'Giá trị', 'Ngày mua', 'Nhà cung cấp', 'Người sử dụng', 'Phòng ban sử dụng', 'Vị trí/Kho', 'Tỉnh/TP', 'Dự án', 'Trạng thái', 'Ghi chú']
    ];

    const formatStatus = (s: string) => {
      switch (s) {
        case 'IN_STOCK': return 'Trong kho';
        case 'USING': return 'Đang sử dụng';
        case 'DAMAGED': return 'Báo hỏng';
        case 'LOST': return 'Mất';
        case 'LIQUIDATED': return 'Đã thanh lý';
        default: return s;
      }
    };

    for (const t of tools) {
      rows.push([
        t.toolCode,
        t.toolName,
        t.category,
        t.quantity.toString(),
        t.unit || 'Cái',
        (t.purchasePrice || 0).toString(),
        t.purchaseDate ? new Date(t.purchaseDate).toLocaleDateString('vi-VN') : '',
        t.supplierName || '',
        t.currentUserName || '',
        t.departmentName || '',
        t.locationName || '',
        t.cityName || '',
        t.projectName || '',
        formatStatus(t.status),
        t.note || ''
      ]);
    }

    const csvContent = '\uFEFF' + rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    return csvContent;
  }

  // --- LIFECYCLE TRANSACTIONS ---

  /**
   * Tool Handover / Recall / Transfer
   */
  static async createHandover(data: {
    type: 'HANDOVER' | 'TRANSFER' | 'RECALL';
    recipientName: string;
    recipientPosition?: string;
    recipientDepartment?: string;
    recipientPhone?: string;
    receiverId?: number;
    receiverDepartmentId?: number;
    newLocation?: string;
    newCity?: string;
    targetLocationId?: number;
    senderName?: string;
    senderDepartment?: string;
    senderPosition?: string;
    senderId?: number;
    note?: string;
    reason?: string;
    toolIds: number[];
    autoComplete?: boolean;
  }, performedBy: string) {
    let lastError: any;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
      const typeCode = data.type === 'HANDOVER' ? 'BBBG-CCDC' : (data.type === 'RECALL' ? 'BBTH-CCDC' : 'BBDC-CCDC');
      const documentNo = await generateDocumentNo(tx, typeCode);
      const normalizedLoc = data.newLocation ? parseAndNormalizeLocation(data.newLocation) : null;

      if (!data.toolIds || data.toolIds.length === 0) {
        throw new Error('Vui lòng chọn ít nhất 1 CCDC.');
      }

      // Check locks and state
      for (const toolId of data.toolIds) {
        const tool = await tx.toolEquipment.findUnique({ where: { id: toolId } });
        if (!tool) throw new Error(`CCDC ID ${toolId} không tồn tại.`);
        if (tool.status === 'LIQUIDATED') throw new Error(`CCDC ${tool.toolCode} đã bị thanh lý.`);
        if (tool.status === 'LOST') throw new Error(`CCDC ${tool.toolCode} đã bị báo mất.`);
      }

      const document = await tx.toolHandoverDocument.create({
        data: {
          documentNo,
          type: data.type,
          recipientName: data.recipientName,
          recipientPosition: data.recipientPosition,
          recipientDepartment: data.recipientDepartment,
          recipientPhone: data.recipientPhone,
          receiverId: data.receiverId,
          receiverDepartmentId: data.receiverDepartmentId,
          newLocation: normalizedLoc?.fullFormatted || data.newLocation,
          newCity: normalizedLoc?.city || data.newCity,
          targetLocationId: data.targetLocationId,
          senderName: data.senderName,
          senderDepartment: data.senderDepartment,
          senderPosition: data.senderPosition,
          senderId: data.senderId,
          reason: data.reason,
          note: data.note,
          status: data.autoComplete ? 'COMPLETED' : 'DRAFT',
          confirmedAt: data.autoComplete ? new Date() : null,
          items: {
            create: await Promise.all(data.toolIds.map(async (id) => {
              const tool = await tx.toolEquipment.findUnique({ where: { id } });
              if (!tool) throw new Error(`Tool ID ${id} not found`);
              const itemNewStatus = data.type === 'RECALL' ? 'IN_STOCK' : 'USING';
              return {
                toolId: tool.id,
                toolCode: tool.toolCode,
                toolName: tool.toolName,
                unit: tool.unit,
                oldStatus: tool.status,
                newStatus: itemNewStatus
              };
            }))
          }
        },
        include: { items: true }
      });

      if (data.autoComplete) {
        for (const item of document.items) {
          const oldTool = await tx.toolEquipment.findUnique({ where: { id: item.toolId } });
          if (!oldTool) continue;

          const isStock = item.newStatus === 'IN_STOCK';
          const updated = await tx.toolEquipment.update({
            where: { id: item.toolId },
            data: {
              status: item.newStatus || 'USING',
              currentUserName: isStock ? null : data.recipientName,
              departmentName: data.type === 'RECALL' ? null : data.recipientDepartment,
              locationName: normalizedLoc?.fullFormatted || data.newLocation,
              cityName: normalizedLoc?.city || data.newCity,
              projectName: normalizedLoc?.project || undefined,
              handoverDate: isStock ? null : new Date(),
            }
          });

          // Assignment log
          await tx.toolAssignment.create({
            data: {
              toolId: item.toolId,
              previousUserName: oldTool.currentUserName,
              newUserName: isStock ? 'KHO CCDC' : data.recipientName,
              newPosition: isStock ? null : data.recipientPosition,
              newDepartmentName: data.recipientDepartment,
              newLocationName: normalizedLoc?.fullFormatted || data.newLocation,
              newCityName: normalizedLoc?.city || data.newCity,
              newStatus: item.newStatus || 'USING',
              effectiveAt: new Date(),
              note: `Biên bản ${documentNo} (${data.type === 'RECALL' ? 'Thu hồi' : (data.type === 'TRANSFER' ? 'Luân chuyển' : 'Bàn giao')})`
            }
          });

          // History
          await tx.toolHistory.create({
            data: {
              toolId: item.toolId,
              toolCode: oldTool.toolCode,
              eventTime: new Date(),
              actionType: data.type,
              oldStatus: oldTool.status,
              newStatus: updated.status,
              oldUserName: oldTool.currentUserName,
              newUserName: updated.currentUserName,
              oldLocationName: oldTool.locationName,
              newLocationName: updated.locationName,
              oldDepartmentName: oldTool.departmentName,
              newDepartmentName: updated.departmentName,
              oldNote: `Hoàn tất biên bản ${documentNo}`,
            }
          });

          await AuditService.log({
            entityType: 'TOOL_EQUIPMENT',
            entityId: item.toolId,
            action: 'ASSIGN',
            details: { documentNo, type: data.type, oldUserName: oldTool.currentUserName, newUserName: updated.currentUserName },
            performedBy,
            tx
          });
        }
      }

      await AuditService.log({
        entityType: 'HANDOVER',
        entityId: document.id,
        action: (data.autoComplete ? 'CREATE_AND_COMPLETE' : 'CREATE') as any,
        details: { documentNo, type: data.type, toolCount: data.toolIds.length, isTool: true },
        performedBy,
        tx
      });

          return document;
        });
      } catch (error: any) {
        lastError = error;
        const target = error?.meta?.target;
        const isDocumentNoConflict = error?.code === 'P2002'
          && (Array.isArray(target)
            ? target.includes('documentNo')
            : String(target || '').includes('documentNo'));
        if (!isDocumentNoConflict || attempt === 5) throw error;
        await new Promise(resolve => setTimeout(resolve, attempt * 50));
      }
    }
    throw lastError;
  }

  static async completeHandover(id: number, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const doc = await tx.toolHandoverDocument.findUnique({
        where: { id },
        include: { items: true }
      });

      if (!doc) throw new Error('Biên bản không tồn tại.');
      if (doc.status === 'COMPLETED') throw new Error('Biên bản đã được hoàn tất trước đó.');
      if (doc.status === 'CANCELLED') throw new Error('Không thể hoàn tất biên bản đã hủy.');

      const normalizedLoc = doc.newLocation ? parseAndNormalizeLocation(doc.newLocation) : null;

      for (const item of doc.items) {
        const oldTool = await tx.toolEquipment.findUnique({ where: { id: item.toolId } });
        if (!oldTool) continue;

        const isStock = item.newStatus === 'IN_STOCK';
        const updated = await tx.toolEquipment.update({
          where: { id: item.toolId },
          data: {
            status: item.newStatus || 'USING',
            currentUserName: isStock ? null : doc.recipientName,
            departmentName: doc.type === 'RECALL' ? null : doc.recipientDepartment,
            locationName: normalizedLoc?.fullFormatted || doc.newLocation,
            cityName: normalizedLoc?.city || doc.newCity,
            projectName: normalizedLoc?.project || undefined,
            handoverDate: isStock ? null : doc.documentDate,
          }
        });

        await tx.toolAssignment.create({
          data: {
            toolId: item.toolId,
            previousUserName: oldTool.currentUserName,
            newUserName: isStock ? 'KHO CCDC' : doc.recipientName,
            newPosition: isStock ? null : doc.recipientPosition,
            newDepartmentName: doc.recipientDepartment,
            newLocationName: normalizedLoc?.fullFormatted || doc.newLocation,
            newCityName: normalizedLoc?.city || doc.newCity,
            newStatus: item.newStatus || 'USING',
            effectiveAt: doc.documentDate,
            note: `Biên bản ${doc.documentNo}`
          }
        });

        await tx.toolHistory.create({
          data: {
            toolId: item.toolId,
            toolCode: oldTool.toolCode,
            eventTime: new Date(),
            actionType: doc.type,
            oldStatus: oldTool.status,
            newStatus: updated.status,
            oldUserName: oldTool.currentUserName,
            newUserName: updated.currentUserName,
            oldLocationName: oldTool.locationName,
            newLocationName: updated.locationName,
            oldDepartmentName: oldTool.departmentName,
            newDepartmentName: updated.departmentName,
            oldNote: `Xác nhận biên bản ${doc.documentNo}`,
          }
        });

        await AuditService.log({
          entityType: 'TOOL_EQUIPMENT',
          entityId: item.toolId,
          action: 'ASSIGN',
          details: { documentNo: doc.documentNo, type: doc.type, oldUserName: oldTool.currentUserName, newUserName: updated.currentUserName },
          performedBy,
          tx
        });
      }

      const updatedDoc = await tx.toolHandoverDocument.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          confirmedAt: new Date()
        }
      });

      return updatedDoc;
    });
  }

  static async cancelHandover(id: number, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const doc = await tx.toolHandoverDocument.findUnique({ where: { id } });
      if (!doc) throw new Error('Biên bản không tồn tại.');
      if (doc.status === 'COMPLETED') throw new Error('Không thể hủy biên bản đã hoàn tất.');

      const updated = await tx.toolHandoverDocument.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date()
        }
      });

      return updated;
    });
  }

  /**
   * Tool Repair / Damage Tickets
   */
  static async createRepairTicket(data: {
    toolId: number;
    reportedBy: string;
    damageLevel?: string;
    damageDescription: string;
    cause?: string;
    canContinueUsing?: boolean;
    repairVendor?: string;
    estimatedCost?: number;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const tool = await tx.toolEquipment.findUnique({ where: { id: data.toolId } });
      if (!tool) throw new Error('CCDC không tồn tại.');

      const repairCode = await generateDocumentNo(tx, 'SC-CCDC');

      const ticket = await tx.toolRepairTicket.create({
        data: {
          repairCode,
          toolId: data.toolId,
          reportedBy: data.reportedBy,
          damageLevel: data.damageLevel,
          damageDescription: data.damageDescription,
          cause: data.cause,
          canContinueUsing: data.canContinueUsing ?? true,
          repairVendor: data.repairVendor,
          estimatedCost: data.estimatedCost ? Number(data.estimatedCost) : 0,
          status: 'OPEN',
          previousToolStatus: tool.status,
          note: data.note
        }
      });

      // Update tool status
      await tx.toolEquipment.update({
        where: { id: data.toolId },
        data: { status: 'DAMAGED' }
      });

      await tx.toolHistory.create({
        data: {
          toolId: tool.id,
          toolCode: tool.toolCode,
          eventTime: new Date(),
          actionType: 'DAMAGE',
          oldStatus: tool.status,
          newStatus: 'DAMAGED',
          oldNote: `Báo hỏng: ${data.damageDescription} (Phiếu ${repairCode})`
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: tool.id,
        action: 'DAMAGE',
        details: { repairCode, damageDescription: data.damageDescription },
        performedBy,
        tx
      });

      return ticket;
    });
  }

  static async completeRepairTicket(id: number, data: {
    actualCost?: number;
    repairAction?: string;
    result: 'FIXED' | 'CANNOT_FIX';
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const ticket = await tx.toolRepairTicket.findUnique({ where: { id } });
      if (!ticket) throw new Error('Phiếu sửa chữa không tồn tại.');
      if (ticket.status === 'COMPLETED') throw new Error('Phiếu sửa chữa đã hoàn tất.');

      const tool = await tx.toolEquipment.findUnique({ where: { id: ticket.toolId } });
      if (!tool) throw new Error('CCDC không tồn tại.');

      const newStatus = data.result === 'FIXED' ? (ticket.previousToolStatus || 'USING') : 'DAMAGED';

      const updatedTicket = await tx.toolRepairTicket.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          actualCost: data.actualCost ? Number(data.actualCost) : 0,
          repairAction: data.repairAction,
          actualFinishDate: new Date(),
          result: data.result,
          note: data.note
        }
      });

      // Update tool status
      await tx.toolEquipment.update({
        where: { id: ticket.toolId },
        data: { status: newStatus }
      });

      await tx.toolHistory.create({
        data: {
          toolId: tool.id,
          toolCode: tool.toolCode,
          eventTime: new Date(),
          actionType: 'REPAIR',
          oldStatus: tool.status,
          newStatus: newStatus,
          oldNote: `Hoàn tất sửa chữa (Phiếu ${ticket.repairCode}): Kết quả ${data.result === 'FIXED' ? 'Đã sửa được' : 'Không thể sửa'}`
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: tool.id,
        action: 'REPAIR',
        details: { repairCode: ticket.repairCode, result: data.result, cost: data.actualCost },
        performedBy,
        tx
      });

      return updatedTicket;
    });
  }

  static async restoreDamagedTool(toolId: number, data: { note?: string }, performedBy: string) {
    const ticket = await prisma.toolRepairTicket.findFirst({
      where: { toolId, status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS', 'PENDING'] } },
      orderBy: { createdAt: 'desc' }
    });
    if (!ticket) throw new Error('Không tìm thấy phiếu sửa chữa đang mở của CCDC này.');
    return this.completeRepairTicket(ticket.id, {
      result: 'FIXED',
      repairAction: 'Đã sửa xong',
      note: data.note || 'Đã sửa xong, tiếp tục sử dụng bình thường'
    }, performedBy);
  }

  /**
   * Tool Lost Report
   */
  static async createLostReport(data: {
    toolId: number;
    reportedBy: string;
    incidentDescription: string;
    responsibleUser?: string;
    responsibleDepartment?: string;
    remainingValue?: number;
    compensationNote?: string;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const tool = await tx.toolEquipment.findUnique({ where: { id: data.toolId } });
      if (!tool) throw new Error('CCDC không tồn tại.');

      const lostCode = await generateDocumentNo(tx, 'BM-MAT-CCDC');

      const report = await tx.toolLostReport.create({
        data: {
          lostCode,
          toolId: data.toolId,
          reportedBy: data.reportedBy,
          incidentDescription: data.incidentDescription,
          responsibleUser: data.responsibleUser,
          responsibleDepartment: data.responsibleDepartment,
          remainingValue: data.remainingValue ? Number(data.remainingValue) : 0,
          compensationNote: data.compensationNote,
          status: 'LOST',
          note: data.note
        }
      });

      // Update tool status
      await tx.toolEquipment.update({
        where: { id: data.toolId },
        data: { status: 'LOST' }
      });

      await tx.toolHistory.create({
        data: {
          toolId: tool.id,
          toolCode: tool.toolCode,
          eventTime: new Date(),
          actionType: 'LOST',
          oldStatus: tool.status,
          newStatus: 'LOST',
          oldNote: `Báo mất: ${data.incidentDescription} (Phiếu ${lostCode})`
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: tool.id,
        action: 'LOST',
        details: { lostCode, incidentDescription: data.incidentDescription },
        performedBy,
        tx
      });

      return report;
    });
  }

  static async findLostTool(toolId: number, data: { note?: string }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const tool = await tx.toolEquipment.findUnique({ where: { id: toolId } });
      if (!tool) throw new Error('CCDC không tồn tại.');
      if (tool.status !== 'LOST') throw new Error('CCDC hiện không ở trạng thái báo mất.');

      const report = await tx.toolLostReport.findFirst({
        where: { toolId, status: { in: ['LOST', 'PENDING'] } },
        orderBy: { createdAt: 'desc' }
      });
      if (!report) throw new Error('Không tìm thấy phiếu báo mất đang mở.');

      const restoredStatus = tool.currentUserName ? 'USING' : 'IN_STOCK';
      await tx.toolLostReport.update({
        where: { id: report.id },
        data: {
          status: 'FOUND',
          foundDate: new Date(),
          foundLocation: tool.locationName,
          conditionWhenFound: 'NORMAL',
          newStatusAfterFound: restoredStatus,
          completedAt: new Date(),
          note: data.note || report.note
        }
      });
      const updated = await tx.toolEquipment.update({ where: { id: toolId }, data: { status: restoredStatus } });
      await tx.toolHistory.create({
        data: {
          toolId,
          toolCode: tool.toolCode,
          eventTime: new Date(),
          actionType: 'FOUND',
          oldStatus: 'LOST',
          newStatus: restoredStatus,
          oldNote: data.note || `Tìm lại CCDC theo phiếu ${report.lostCode}`
        }
      });
      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT', entityId: toolId, action: 'UPDATE',
        details: { action: 'FOUND', lostCode: report.lostCode, newStatus: restoredStatus }, performedBy, tx
      });
      return updated;
    });
  }

  /**
   * Tool Liquidation / Disposal
   */
  static async createLiquidation(data: {
    toolIds: number[];
    reason?: string;
    buyerName?: string;
    totalValue?: number;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const liquidationCode = await generateDocumentNo(tx, 'TL-CCDC');

      const record = await tx.toolLiquidationRecord.create({
        data: {
          liquidationCode,
          liquidationType: 'LIQUIDATION',
          reason: data.reason,
          buyerName: data.buyerName,
          totalValue: data.totalValue ? Number(data.totalValue) : 0,
          status: 'COMPLETED',
          note: data.note,
          items: {
            create: await Promise.all(data.toolIds.map(async (id) => {
              const tool = await tx.toolEquipment.findUnique({ where: { id } });
              if (!tool) throw new Error(`CCDC ID ${id} không tồn tại.`);
              return {
                toolId: id,
                toolValue: tool.purchasePrice || 0
              };
            }))
          }
        },
        include: { items: true }
      });

      for (const item of record.items) {
        const tool = await tx.toolEquipment.findUnique({ where: { id: item.toolId } });
        if (!tool) continue;

        // Update status to liquidated
        await tx.toolEquipment.update({
          where: { id: item.toolId },
          data: { status: 'LIQUIDATED' }
        });

        await tx.toolHistory.create({
          data: {
            toolId: tool.id,
            toolCode: tool.toolCode,
            eventTime: new Date(),
            actionType: 'LIQUIDATED',
            oldStatus: tool.status,
            newStatus: 'LIQUIDATED',
            oldNote: `Thanh lý CCDC (Quyết định ${liquidationCode}). Lý do: ${data.reason}`
          }
        });

        await AuditService.log({
          entityType: 'TOOL_EQUIPMENT',
          entityId: tool.id,
          action: 'LIQUIDATE',
          details: { liquidationCode, reason: data.reason },
          performedBy,
          tx
        });
      }

      return record;
    });
  }

  /**
   * Tool Inventory checks
   */
  static async createInventoryCheck(data: {
    inventoryName: string;
    note?: string;
    scopeType?: string;
    scopeValue?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const inventoryCode = await generateDocumentNo(tx, 'KK-CCDC');

      // Fetch expected tools based on scope
      const where: any = { isDeleted: false, status: { in: ['IN_STOCK', 'USING', 'DAMAGED'] } };
      if (data.scopeType === 'DEPARTMENT' && data.scopeValue) {
        where.departmentName = data.scopeValue;
      } else if (data.scopeType === 'LOCATION' && data.scopeValue) {
        where.locationName = { contains: data.scopeValue };
      }

      const expectedTools = await tx.toolEquipment.findMany({ where });

      const itemsToCreate = [];
      for (const t of expectedTools) {
        let expectedQty = t.quantity || 0;
        if (t.managementType === 'QUANTITY') {
          if (data.scopeType === 'LOCATION' && data.scopeValue) {
            const stock = await tx.toolStock.findFirst({
              where: { toolId: t.id, locationName: { contains: data.scopeValue } }
            });
            expectedQty = stock ? stock.quantityAvailable : 0;
          }
        } else {
          expectedQty = 1;
        }

        itemsToCreate.push({
          toolId: t.id,
          toolCode: t.toolCode,
          expectedStatus: t.status,
          expectedLocation: t.locationName,
          checkStatus: 'PENDING',
          expectedQuantity: expectedQty,
          actualGoodQty: expectedQty, // Gán mặc định bằng sổ sách lúc tạo
          actualRepairQty: 0,
          actualBrokenQty: 0,
          actualLostQty: 0,
          mismatchQty: 0
        });
      }

      const check = await tx.toolInventoryCheck.create({
        data: {
          inventoryCode,
          inventoryName: data.inventoryName,
          inventoryDate: new Date(),
          status: 'OPEN',
          scopeType: data.scopeType,
          scopeValue: data.scopeValue,
          note: data.note,
          items: {
            create: itemsToCreate
          }
        },
        include: { items: true }
      });

      return check;
    });
  }

  static async submitItemCheck(checkId: number, data: {
    toolId: number;
    actualStatus?: string;
    actualLocation?: string;
    quality?: string;
    checkCondition: 'FOUND' | 'MISSING' | 'DAMAGED' | 'WRONG_LOCATION';
    note?: string;
    actualGoodQty?: number;
    actualRepairQty?: number;
    actualBrokenQty?: number;
    actualLostQty?: number;
    photos?: string[];
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const checkItem = await tx.toolInventoryItem.findFirst({
        where: { inventoryCheckId: checkId, toolId: data.toolId },
        include: { tool: true }
      });

      if (!checkItem) throw new Error('CCDC không nằm trong đợt kiểm kê này.');

      const isQtyMode = checkItem.tool.managementType === 'QUANTITY';

      let actualGood = data.actualGoodQty !== undefined ? Number(data.actualGoodQty) : (isQtyMode ? checkItem.expectedQuantity : 1);
      let actualRepair = data.actualRepairQty !== undefined ? Number(data.actualRepairQty) : 0;
      let actualBroken = data.actualBrokenQty !== undefined ? Number(data.actualBrokenQty) : 0;
      let actualLost = data.actualLostQty !== undefined ? Number(data.actualLostQty) : 0;

      if (!isQtyMode) {
        actualGood = data.checkCondition === 'FOUND' ? 1 : 0;
        actualRepair = data.checkCondition === 'DAMAGED' ? 1 : 0;
        actualBroken = 0;
        actualLost = data.checkCondition === 'MISSING' ? 1 : 0;
      }

      const totalActual = actualGood + actualRepair + actualBroken + actualLost;
      const expected = checkItem.expectedQuantity;
      const mismatch = totalActual - expected;

      // Calculate matching result
      let result = 'MATCHED';
      if (mismatch !== 0) {
        result = mismatch < 0 ? 'MISSING' : 'EXTRA';
      } else if (actualRepair > 0 || actualBroken > 0) {
        result = 'DAMAGED';
      } else if (data.actualLocation && data.actualLocation !== checkItem.expectedLocation) {
        result = 'WRONG_LOCATION';
      }

      const updatedItem = await tx.toolInventoryItem.update({
        where: { id: checkItem.id },
        data: {
          actualStatus: data.actualStatus || (actualGood > 0 ? 'IN_STOCK' : 'LOST'),
          actualLocation: data.actualLocation || checkItem.expectedLocation,
          quality: data.quality || (actualGood > 0 ? 'GOOD' : 'NORMAL'),
          checkCondition: data.checkCondition,
          note: data.note,
          result,
          checkStatus: 'CHECKED',
          checkedAt: new Date(),
          checkedBy: performedBy,
          actualGoodQty: actualGood,
          actualRepairQty: actualRepair,
          actualBrokenQty: actualBroken,
          actualLostQty: actualLost,
          mismatchQty: mismatch,
          photos: data.photos || []
        }
      });

      return updatedItem;
    });
  }

  static async completeInventoryCheck(id: number, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const check = await tx.toolInventoryCheck.findUnique({
        where: { id },
        include: { items: { include: { tool: true } } }
      });

      if (!check) throw new Error('Phiếu kiểm kê không tồn tại.');
      if (check.status === 'COMPLETED') throw new Error('Phiếu kiểm kê đã hoàn tất.');

      // Update CCDC database entries / ToolStock after inventory
      for (const item of check.items) {
        if (item.checkStatus === 'CHECKED') {
          const isQtyMode = item.tool.managementType === 'QUANTITY';
          const location = item.actualLocation || item.expectedLocation || 'Kho chính';

          if (isQtyMode) {
            // Update ToolStock for this location
            const stock = await tx.toolStock.findUnique({
              where: { toolId_locationName: { toolId: item.toolId, locationName: location } }
            });

            // Cập nhật lại số lượng tồn kho theo thực tế kiểm kê
            await tx.toolStock.upsert({
              where: { toolId_locationName: { toolId: item.toolId, locationName: location } },
              update: {
                quantityAvailable: item.actualGoodQty,
                quantityRepairing: item.actualRepairQty,
                quantityBroken: item.actualBrokenQty,
                quantityLost: item.actualLostQty
              },
              create: {
                toolId: item.toolId,
                locationName: location,
                quantityAvailable: item.actualGoodQty,
                quantityRepairing: item.actualRepairQty,
                quantityBroken: item.actualBrokenQty,
                quantityLost: item.actualLostQty
              }
            });

            // Đồng bộ lại tổng số lượng của CCDC chung
            const allStocks = await tx.toolStock.findMany({
              where: { toolId: item.toolId }
            });
            const totalQty = allStocks.reduce((sum: number, s: any) => sum + s.quantityAvailable + s.quantityUsing + s.quantityTransit + s.quantityRepairing + s.quantityBroken + s.quantityLost, 0);
            
            await tx.toolEquipment.update({
              where: { id: item.toolId },
              data: {
                quantity: totalQty,
                status: totalQty > 0 ? 'IN_STOCK' : 'LOST',
                updatedAt: new Date()
              }
            });

            // Ghi nhận lịch sử giao dịch kho
            await tx.toolStockTransaction.create({
              data: {
                toolId: item.toolId,
                type: 'ADJUST',
                quantity: item.mismatchQty,
                toLocation: location,
                performedBy,
                note: `Điều chỉnh kiểm kê đợt ${check.inventoryCode}. Lệch: ${item.mismatchQty}. Khả dụng: ${item.actualGoodQty}, Đang sửa: ${item.actualRepairQty}, Hỏng hủy: ${item.actualBrokenQty}, Mất: ${item.actualLostQty}`
              }
            });

            // Ghi lịch sử CCDC
            await tx.toolHistory.create({
              data: {
                toolId: item.toolId,
                toolCode: item.toolCode,
                eventTime: new Date(),
                actionType: 'INVENTORY',
                oldStatus: item.expectedStatus || 'IN_STOCK',
                newStatus: totalQty > 0 ? 'IN_STOCK' : 'LOST',
                oldLocationName: item.expectedLocation,
                newLocationName: location,
                oldNote: `Kiểm kê kỳ ${check.inventoryCode}: Lệch ${item.mismatchQty}, Tốt ${item.actualGoodQty}, Sửa ${item.actualRepairQty}, Hủy ${item.actualBrokenQty}, Mất ${item.actualLostQty}`
              }
            });

          } else {
            // Xử lý CCDC kiểm kê từng mã cá thể (INDIVIDUAL)
            const updates: any = {};
            if (item.actualStatus) updates.status = item.actualStatus;
            if (item.actualLocation) updates.locationName = item.actualLocation;

            if (Object.keys(updates).length > 0) {
              const tool = await tx.toolEquipment.findUnique({ where: { id: item.toolId } });
              if (!tool) continue;

              await tx.toolEquipment.update({
                where: { id: item.toolId },
                data: updates
              });

              await tx.toolHistory.create({
                data: {
                  toolId: item.toolId,
                  toolCode: item.toolCode,
                  eventTime: new Date(),
                  actionType: 'INVENTORY',
                  oldStatus: tool.status,
                  newStatus: updates.status || tool.status,
                  oldLocationName: tool.locationName,
                  newLocationName: updates.locationName || tool.locationName,
                  oldNote: `Cập nhật dữ liệu từ phiếu kiểm kê ${check.inventoryCode}. Kết quả: ${item.result}`
                }
              });
            }
          }
        }
      }

      const updatedCheck = await tx.toolInventoryCheck.update({
        where: { id },
        data: { status: 'COMPLETED' }
      });

      return updatedCheck;
    });
  }

  static async getInventorySessions(inventoryCheckId: number) {
    return await prisma.toolInventorySession.findMany({
      where: { inventoryCheckId },
      orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
      include: {
        _count: { select: { details: true } },
        details: true
      }
    });
  }

  static async createInventorySession(inventoryCheckId: number, data: any) {
    const where = this.buildToolInventoryScopeWhere(data.departmentName, data.locationName);
    const assetCountPlan = await prisma.toolEquipment.count({ where });

    return await prisma.toolInventorySession.create({
      data: {
        inventoryCheckId,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : new Date(),
        companyName: data.companyName || null,
        projectName: data.projectName || null,
        departmentName: data.departmentName || null,
        locationName: data.locationName || null,
        checkerName: data.checkerName || null,
        representativeName: data.representativeName || null,
        assetCountPlan,
        note: data.note || null
      }
    });
  }

  static async startInventorySession(sessionId: number) {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.toolInventorySession.findUnique({
        where: { id: sessionId },
        include: { details: true }
      });
      if (!session) throw new Error('Không tìm thấy phiên kiểm kê CCDC.');

      if (session.details.length === 0) {
        const where = this.buildToolInventoryScopeWhere(session.departmentName || undefined, session.locationName || undefined);
        const tools = await tx.toolEquipment.findMany({ where, orderBy: { toolCode: 'asc' } });
        if (tools.length > 0) {
          await tx.toolInventoryDetail.createMany({
            data: tools.map((tool) => ({
              sessionId,
              toolId: tool.id,
              toolCode: tool.toolCode,
              toolName: tool.toolName,
              bookUserName: tool.currentUserName || null,
              bookDepartmentName: tool.departmentName || null,
              bookLocationName: tool.specificLocation || tool.locationName || tool.areaName || tool.floorName || tool.buildingName || null,
              actualUserName: tool.currentUserName || null,
              actualDepartmentName: tool.departmentName || null,
              actualLocationName: tool.specificLocation || tool.locationName || tool.areaName || tool.floorName || tool.buildingName || null,
              expectedQuantity: tool.quantity || 1,
              actualQuantity: tool.quantity || 1,
              resultStatus: 'MATCH'
            }))
          });
        }

        await tx.toolInventorySession.update({
          where: { id: sessionId },
          data: { assetCountPlan: tools.length }
        });
      }

      await tx.toolInventoryCheck.update({
        where: { id: session.inventoryCheckId },
        data: { status: 'IN_PROGRESS' }
      });

      return await tx.toolInventorySession.update({
        where: { id: sessionId },
        data: { status: 'IN_PROGRESS' },
        include: { details: { include: { tool: true } } }
      });
    });
  }

  static async getInventorySessionDetail(sessionId: number) {
    const session = await prisma.toolInventorySession.findUnique({
      where: { id: sessionId },
      include: {
        inventoryCheck: true,
        details: {
          orderBy: [{ resultStatus: 'asc' }, { id: 'asc' }],
          include: { tool: true }
        }
      }
    });
    if (!session) throw new Error('Không tìm thấy phiên kiểm kê CCDC.');
    return session;
  }

  static async updateInventoryDetail(detailId: number, data: any, performedBy: string) {
    const detail = await prisma.toolInventoryDetail.findUnique({
      where: { id: detailId },
      include: { session: true }
    });
    if (!detail) throw new Error('Không tìm thấy dòng kiểm kê CCDC.');
    if (detail.session.status === 'COMPLETED') throw new Error('Phiên kiểm kê đã chốt, không thể sửa.');

    const resultStatus = data.resultStatus || this.resolveInventoryResultStatus({
      bookUserName: detail.bookUserName,
      actualUserName: data.actualUserName,
      bookLocationName: detail.bookLocationName,
      actualLocationName: data.actualLocationName,
      condition: data.condition
    });

    const updated = await prisma.toolInventoryDetail.update({
      where: { id: detailId },
      data: {
        actualUserName: data.actualUserName ?? detail.actualUserName,
        actualDepartmentName: data.actualDepartmentName ?? detail.actualDepartmentName,
        actualLocationName: data.actualLocationName ?? detail.actualLocationName,
        actualQuantity: data.actualQuantity !== undefined ? Number(data.actualQuantity) : detail.actualQuantity,
        resultStatus,
        note: data.note ?? detail.note,
        imageUrl: data.imageUrl ?? detail.imageUrl,
        checkedAt: new Date()
      }
    });

    await prisma.toolInventorySession.update({
      where: { id: detail.sessionId },
      data: { status: 'IN_PROGRESS' }
    });

    if (updated.toolId) {
      await prisma.toolHistory.create({
        data: {
          toolId: updated.toolId,
          toolCode: updated.toolCode || '',
          eventTime: new Date(),
          actionType: 'INVENTORY',
          oldUserName: updated.bookUserName,
          newUserName: updated.actualUserName,
          oldDepartmentName: updated.bookDepartmentName,
          newDepartmentName: updated.actualDepartmentName,
          oldLocationName: updated.bookLocationName,
          newLocationName: updated.actualLocationName,
          oldNote: `Kiểm kê phiên ${detail.sessionId}: ${updated.resultStatus}. Người ghi nhận: ${performedBy}`
        }
      });
    }

    return updated;
  }

  static async addExtraInventoryDetail(sessionId: number, data: any) {
    const session = await prisma.toolInventorySession.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('Không tìm thấy phiên kiểm kê CCDC.');
    if (session.status === 'COMPLETED') throw new Error('Phiên kiểm kê đã chốt, không thể thêm.');

    return await prisma.toolInventoryDetail.create({
      data: {
        sessionId,
        toolId: null,
        toolCode: null,
        toolName: data.toolName || data.name,
        serialNumber: data.serialNumber || null,
        actualUserName: data.actualUserName || null,
        actualDepartmentName: data.actualDepartmentName || session.departmentName || null,
        actualLocationName: data.actualLocationName || session.locationName || null,
        expectedQuantity: 0,
        actualQuantity: data.actualQuantity ? Number(data.actualQuantity) : 1,
        resultStatus: 'EXTRA',
        note: data.note || 'Tài sản phát sinh ngoài sổ, chờ xác minh nguồn gốc',
        imageUrl: data.imageUrl || null,
        checkedAt: new Date()
      }
    });
  }

  static async completeInventorySession(sessionId: number) {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.toolInventorySession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED', completedAt: new Date() },
        include: { inventoryCheck: { include: { sessions: true } }, details: true }
      });

      const remaining = await tx.toolInventorySession.count({
        where: { inventoryCheckId: session.inventoryCheckId, status: { not: 'COMPLETED' } }
      });
      if (remaining === 0) {
        await tx.toolInventoryCheck.update({
          where: { id: session.inventoryCheckId },
          data: { status: 'COMPLETED' }
        });
      }

      return session;
    });
  }

  static async getInventorySessionReport(sessionId: number) {
    const session = await this.getInventorySessionDetail(sessionId);
    const details = session.details || [];
    const matched = details.filter((d: any) => d.resultStatus === 'MATCH').length;
    const deviations = details.length - matched;
    return {
      title: `BIÊN BẢN KIỂM KÊ ${session.departmentName || session.locationName || 'CCDC'} NGÀY ${session.scheduledDate.toLocaleDateString('vi-VN')}`,
      session,
      summary: {
        bookTotal: details.filter((d: any) => d.resultStatus !== 'EXTRA').length,
        actualTotal: details.filter((d: any) => d.resultStatus !== 'MISSING').length,
        matched,
        deviations
      },
      deviations: details.filter((d: any) => d.resultStatus !== 'MATCH'),
      signatures: ['Đại diện phòng ban', 'Người kiểm kê', 'Trưởng HCNS']
    };
  }

  private static buildToolInventoryScopeWhere(departmentName?: string, locationName?: string) {
    const where: any = { isDeleted: false };
    const or: any[] = [];
    if (departmentName) or.push({ departmentName });
    if (locationName) {
      or.push({ locationName: { contains: locationName } });
      or.push({ buildingName: { contains: locationName } });
      or.push({ floorName: { contains: locationName } });
      or.push({ areaName: { contains: locationName } });
      or.push({ specificLocation: { contains: locationName } });
    }
    if (or.length > 0) where.OR = or;
    return where;
  }

  private static resolveInventoryResultStatus(data: any) {
    if (data.condition === 'MISSING') return 'MISSING';
    if (data.condition === 'DAMAGED') return 'DAMAGED';
    if (data.bookUserName && data.actualUserName && data.bookUserName !== data.actualUserName) return 'WRONG_USER';
    if (data.bookLocationName && data.actualLocationName && data.bookLocationName !== data.actualLocationName) return 'WRONG_LOCATION';
    return 'MATCH';
  }

  // --- QUANTITY STOCK MANAGEMENT TRANSACTION SERVICES ---

  static async transferStock(data: {
    toolId: number;
    quantity: number;
    fromLocation: string;
    toLocation: string;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const tool = await tx.toolEquipment.findUnique({ where: { id: data.toolId } });
      if (!tool) throw new Error('Không tìm thấy CCDC.');

      const sourceStock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.fromLocation } }
      });
      if (!sourceStock || sourceStock.quantityAvailable < data.quantity) {
        throw new Error(`Số lượng khả dụng tại nguồn không đủ (Hiện có: ${sourceStock?.quantityAvailable || 0}).`);
      }

      await tx.toolStock.update({
        where: { id: sourceStock.id },
        data: { quantityAvailable: { decrement: data.quantity } }
      });

      await tx.toolStock.upsert({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.toLocation } },
        create: {
          toolId: data.toolId,
          locationName: data.toLocation,
          quantityAvailable: data.quantity
        },
        update: {
          quantityAvailable: { increment: data.quantity }
        }
      });

      const stockTx = await tx.toolStockTransaction.create({
        data: {
          toolId: data.toolId,
          type: 'TRANSFER',
          quantity: data.quantity,
          fromLocation: data.fromLocation,
          toLocation: data.toLocation,
          performedBy,
          note: data.note || 'Điều chuyển CCDC'
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: data.toolId,
        action: 'TRANSFER_STOCK' as any,
        details: { quantity: data.quantity, from: data.fromLocation, to: data.toLocation, note: data.note },
        performedBy,
        tx
      });

      return stockTx;
    });
  }

  static async allocateStock(data: {
    toolId: number;
    quantity: number;
    fromLocation: string;
    toLocation: string;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const sourceStock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.fromLocation } }
      });
      if (!sourceStock || sourceStock.quantityAvailable < data.quantity) {
        throw new Error('Số lượng khả dụng không đủ.');
      }
      await tx.toolStock.update({
        where: { id: sourceStock.id },
        data: { quantityAvailable: { decrement: data.quantity } }
      });
      await tx.toolStock.upsert({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.toLocation } },
        create: {
          toolId: data.toolId,
          locationName: data.toLocation,
          quantityUsing: data.quantity
        },
        update: {
          quantityUsing: { increment: data.quantity }
        }
      });
      return await tx.toolStockTransaction.create({
        data: {
          toolId: data.toolId,
          type: 'USE',
          quantity: data.quantity,
          fromLocation: data.fromLocation,
          toLocation: data.toLocation,
          performedBy,
          note: data.note || 'Cấp phát sử dụng'
        }
      });
    });
  }

  static async recallStock(data: {
    toolId: number;
    quantity: number;
    fromLocation: string;
    toLocation: string;
    qtyGood: number;
    qtyRepair: number;
    qtyBroken: number;
    qtyLost: number;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const tool = await tx.toolEquipment.findUnique({ where: { id: data.toolId } });
      if (!tool) throw new Error('Không tìm thấy CCDC.');

      if (data.qtyGood + data.qtyRepair + data.qtyBroken + data.qtyLost !== data.quantity) {
        throw new Error('Tổng số lượng thu hồi chi tiết không khớp tổng số lượng yêu cầu.');
      }

      const sourceStock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.fromLocation } }
      });
      if (!sourceStock) {
        throw new Error(`Không tìm thấy thông tin tồn kho tại vị trí ${data.fromLocation}.`);
      }
      const sourceUsing = sourceStock.quantityUsing;
      if (sourceUsing < data.quantity) {
        throw new Error(`Số lượng đang sử dụng tại nguồn không đủ (Hiện có: ${sourceUsing}).`);
      }

      await tx.toolStock.update({
        where: { id: sourceStock.id },
        data: { quantityUsing: { decrement: data.quantity } }
      });

      await tx.toolStock.upsert({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.toLocation } },
        create: {
          toolId: data.toolId,
          locationName: data.toLocation,
          quantityAvailable: data.qtyGood,
          quantityRepairing: data.qtyRepair,
          quantityBroken: data.qtyBroken,
          quantityLost: data.qtyLost
        },
        update: {
          quantityAvailable: { increment: data.qtyGood },
          quantityRepairing: { increment: data.qtyRepair },
          quantityBroken: { increment: data.qtyBroken },
          quantityLost: { increment: data.qtyLost }
        }
      });

      const stockTx = await tx.toolStockTransaction.create({
        data: {
          toolId: data.toolId,
          type: 'RECALL',
          quantity: data.quantity,
          fromLocation: data.fromLocation,
          toLocation: data.toLocation,
          performedBy,
          note: data.note || `Thu hồi (Tốt: ${data.qtyGood}, Sửa: ${data.qtyRepair}, Hỏng hủy: ${data.qtyBroken}, Mất: ${data.qtyLost})`
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: data.toolId,
        action: 'RECALL_STOCK' as any,
        details: { quantity: data.quantity, good: data.qtyGood, repair: data.qtyRepair, broken: data.qtyBroken, lost: data.qtyLost, from: data.fromLocation, to: data.toLocation },
        performedBy,
        tx
      });

      return stockTx;
    });
  }

  static async reportDamageStock(data: {
    toolId: number;
    quantity: number;
    locationName: string;
    canRepair: boolean;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const stock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.locationName } }
      });
      if (!stock) throw new Error('Không tìm thấy CCDC tại vị trí này.');
      
      const totalAvail = stock.quantityAvailable + stock.quantityUsing;
      if (totalAvail < data.quantity) {
        throw new Error('Số lượng khả dụng/đang dùng không đủ để báo hỏng.');
      }

      let qtyToDecAvail = Math.min(stock.quantityAvailable, data.quantity);
      let qtyToDecUsing = data.quantity - qtyToDecAvail;

      if (data.canRepair) {
        await tx.toolStock.update({
          where: { id: stock.id },
          data: {
            quantityAvailable: { decrement: qtyToDecAvail },
            quantityUsing: { decrement: qtyToDecUsing },
            quantityRepairing: { increment: data.quantity }
          }
        });
        await tx.toolStockTransaction.create({
          data: {
            toolId: data.toolId,
            type: 'DAMAGE',
            quantity: data.quantity,
            fromLocation: data.locationName,
            performedBy,
            note: data.note || 'Báo hỏng (Có thể sửa)'
          }
        });
      } else {
        await tx.toolStock.update({
          where: { id: stock.id },
          data: {
            quantityAvailable: { decrement: qtyToDecAvail },
            quantityUsing: { decrement: qtyToDecUsing },
            quantityBroken: { increment: data.quantity }
          }
        });

        const reportCode = await generateDocumentNo(tx, 'DXH-CCDC');
        await tx.toolDamageReport.create({
          data: {
            reportCode,
            description: data.note || 'Báo hỏng đề xuất hủy',
            solutionType: 'DESTROY_PROPOSAL',
            approvalStatus: 'PENDING',
            quantity: data.quantity,
            locationName: data.locationName,
            status: 'PENDING',
            items: {
              create: [{
                toolId: data.toolId
              }]
            }
          }
        });

        await tx.toolStockTransaction.create({
          data: {
            toolId: data.toolId,
            type: 'DAMAGE',
            quantity: data.quantity,
            fromLocation: data.locationName,
            performedBy,
            note: data.note || 'Báo hỏng (Đề xuất hủy)'
          }
        });
      }

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: data.toolId,
        action: 'DAMAGE_STOCK' as any,
        details: { quantity: data.quantity, canRepair: data.canRepair, location: data.locationName },
        performedBy,
        tx
      });
    });
  }

  static async completeRepairStock(data: {
    toolId: number;
    quantity: number;
    locationName: string;
    actualCost: number;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const stock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.locationName } }
      });
      if (!stock || stock.quantityRepairing < data.quantity) {
        throw new Error('Số lượng đang sửa chữa tại vị trí không đủ.');
      }

      await tx.toolStock.update({
        where: { id: stock.id },
        data: {
          quantityRepairing: { decrement: data.quantity },
          quantityAvailable: { increment: data.quantity }
        }
      });

      await tx.toolStockTransaction.create({
        data: {
          toolId: data.toolId,
          type: 'REPAIR_COMPLETE',
          quantity: data.quantity,
          toLocation: data.locationName,
          performedBy,
          note: data.note || `Hoàn tất sửa chữa. Chi phí: ${data.actualCost.toLocaleString()} VNĐ`
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: data.toolId,
        action: 'REPAIR_COMPLETE_STOCK' as any,
        details: { quantity: data.quantity, cost: data.actualCost, location: data.locationName },
        performedBy,
        tx
      });
    });
  }

  static async reportLostStock(data: {
    toolId: number;
    quantity: number;
    locationName: string;
    responsibleUser?: string;
    compensationValue?: number;
    documentNo?: string;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const stock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.locationName } }
      });
      
      const totalAvail = stock ? (stock.quantityAvailable + stock.quantityUsing) : 0;
      if (!stock || totalAvail < data.quantity) {
        throw new Error('Số lượng khả dụng/đang dùng không đủ để báo mất.');
      }

      let qtyToDecAvail = Math.min(stock.quantityAvailable, data.quantity);
      let qtyToDecUsing = data.quantity - qtyToDecAvail;

      await tx.toolStock.update({
        where: { id: stock.id },
        data: {
          quantityAvailable: { decrement: qtyToDecAvail },
          quantityUsing: { decrement: qtyToDecUsing },
          quantityLost: { increment: data.quantity }
        }
      });

      const lostCode = await generateDocumentNo(tx, 'BMT-CCDC');
      await tx.toolLostReport.create({
        data: {
          lostCode,
          toolId: data.toolId,
          reportedBy: performedBy,
          responsibleUser: data.responsibleUser,
          remainingValue: data.compensationValue || 0,
          incidentDescription: data.note || 'Báo mất thất thoát CCDC',
          status: 'PENDING',
          approvalStatus: 'PENDING',
          quantity: data.quantity,
          locationName: data.locationName
        }
      });

      await tx.toolStockTransaction.create({
        data: {
          toolId: data.toolId,
          type: 'LOST',
          quantity: data.quantity,
          fromLocation: data.locationName,
          performedBy,
          note: data.note || `Báo mất (Chờ duyệt)`
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: data.toolId,
        action: 'LOST_STOCK' as any,
        details: { quantity: data.quantity, location: data.locationName },
        performedBy,
        tx
      });
    });
  }

  static async findLostStock(data: {
    toolId: number;
    quantity: number;
    locationName: string;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const quantity = Number(data.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Số lượng tìm lại phải lớn hơn 0.');
      const stock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.locationName } }
      });
      if (!stock || stock.quantityLost < quantity) throw new Error('Số lượng đang mất tại vị trí không đủ.');

      await tx.toolStock.update({
        where: { id: stock.id },
        data: { quantityLost: { decrement: quantity }, quantityAvailable: { increment: quantity } }
      });
      const report = await tx.toolLostReport.findFirst({
        where: { toolId: data.toolId, locationName: data.locationName, status: { in: ['LOST', 'PENDING'] } },
        orderBy: { createdAt: 'desc' }
      });
      if (report) {
        const remaining = Math.max(0, report.quantity - quantity);
        await tx.toolLostReport.update({
          where: { id: report.id },
          data: {
            quantity: remaining,
            status: remaining === 0 ? 'FOUND' : report.status,
            foundDate: new Date(),
            foundLocation: data.locationName,
            conditionWhenFound: 'NORMAL',
            newStatusAfterFound: 'IN_STOCK',
            completedAt: remaining === 0 ? new Date() : null,
            note: data.note || report.note
          }
        });
      }
      const stockTx = await tx.toolStockTransaction.create({
        data: { toolId: data.toolId, type: 'FOUND', quantity, toLocation: data.locationName, performedBy, note: data.note || 'Đã tìm lại CCDC' }
      });
      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT', entityId: data.toolId, action: 'UPDATE',
        details: { action: 'FOUND_STOCK', quantity, location: data.locationName }, performedBy, tx
      });
      return stockTx;
    });
  }

  static async approveDestroyProposal(id: number, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.toolDamageReport.findUnique({
        where: { id },
        include: { items: true }
      });
      if (!report) throw new Error('Không tìm thấy phiếu đề xuất hủy.');
      if (report.approvalStatus !== 'PENDING') throw new Error('Phiếu này đã được xử lý.');

      const item = report.items[0];
      if (!item) throw new Error('Không tìm thấy CCDC trong phiếu.');

      const location = report.locationName || 'Kho chính';

      const stock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: item.toolId, locationName: location } }
      });
      if (!stock || stock.quantityBroken < report.quantity) {
        throw new Error('Số lượng chờ hủy tại kho không đủ.');
      }

      await tx.toolStock.update({
        where: { id: stock.id },
        data: {
          quantityBroken: { decrement: report.quantity },
          quantityDestroyed: { increment: report.quantity }
        }
      });

      await tx.toolDamageReport.update({
        where: { id },
        data: {
          approvalStatus: 'APPROVED',
          status: 'APPROVED',
          note: `Phê duyệt bởi ${performedBy}`
        }
      });

      await tx.toolStockTransaction.create({
        data: {
          toolId: item.toolId,
          type: 'DESTROY',
          quantity: report.quantity,
          fromLocation: location,
          performedBy,
          note: `Phê duyệt hủy từ đề xuất ${report.reportCode}`
        }
      });
    });
  }

  static async approveLostReport(id: number, data: { handlingType: 'COMPENSATION' | 'WAIVED', compensationNote?: string }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.toolLostReport.findUnique({
        where: { id }
      });
      if (!report) throw new Error('Không tìm thấy phiếu báo mất.');
      if (report.approvalStatus !== 'PENDING') throw new Error('Phiếu này đã được xử lý.');

      await tx.toolLostReport.update({
        where: { id },
        data: {
          approvalStatus: 'APPROVED',
          status: 'APPROVED',
          handlingType: data.handlingType,
          compensationNote: data.compensationNote,
          completedAt: new Date()
        }
      });

      await tx.toolStockTransaction.create({
        data: {
          toolId: report.toolId,
          type: 'ADJUST',
          quantity: report.quantity,
          fromLocation: report.locationName,
          performedBy,
          note: `Phê duyệt báo mất ${report.lostCode}. Phương án: ${data.handlingType === 'COMPENSATION' ? 'Bồi thường' : 'Miễn trách nhiệm'}. Ghi chú: ${data.compensationNote || ''}`
        }
      });
    });
  }

  static async importNewBatch(data: {
    toolId: number;
    quantity: number;
    purchasePrice: number;
    purchaseDate?: string;
    supplierName?: string;
    locationName: string;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const tool = await tx.toolEquipment.findUnique({
        where: { id: data.toolId },
        include: { batches: true }
      });
      if (!tool) throw new Error('Không tìm thấy CCDC.');

      const lotIndex = tool.batches.length + 1;
      const lotNumber = `LOT${lotIndex.toString().padStart(3, '0')}`;

      await tx.toolBatch.create({
        data: {
          toolId: data.toolId,
          batchNumber: lotNumber,
          quantity: data.quantity,
          purchasePrice: data.purchasePrice,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
          supplierName: data.supplierName
        }
      });

      await tx.toolStock.upsert({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.locationName } },
        create: {
          toolId: data.toolId,
          locationName: data.locationName,
          quantityAvailable: data.quantity
        },
        update: {
          quantityAvailable: { increment: data.quantity }
        }
      });

      await tx.toolEquipment.update({
        where: { id: data.toolId },
        data: {
          quantity: { increment: data.quantity }
        }
      });

      await tx.toolStockTransaction.create({
        data: {
          toolId: data.toolId,
          type: 'IMPORT',
          quantity: data.quantity,
          toLocation: data.locationName,
          performedBy,
          note: data.note || `Nhập thêm lô hàng ${lotNumber}`
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: data.toolId,
        action: 'IMPORT_BATCH_STOCK' as any,
        details: { lotNumber, quantity: data.quantity, price: data.purchasePrice, location: data.locationName },
        performedBy,
        tx
      });
    });
  }

  static async adjustStock(data: {
    toolId: number;
    locationName: string;
    actualQuantity: number;
    action: 'ADJUST_STOCK' | 'RECORD_LOST' | 'WAIT_VERIFY';
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const stock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.locationName } }
      });
      if (!stock) throw new Error('Không tìm thấy dữ liệu tồn kho tại vị trí này.');

      const diff = data.actualQuantity - stock.quantityAvailable;

      if (data.action === 'ADJUST_STOCK') {
        await tx.toolStock.update({
          where: { id: stock.id },
          data: { quantityAvailable: data.actualQuantity }
        });
        await tx.toolEquipment.update({
          where: { id: data.toolId },
          data: { quantity: { increment: diff } }
        });
        await tx.toolStockTransaction.create({
          data: {
            toolId: data.toolId,
            type: 'ADJUST',
            quantity: diff,
            toLocation: data.locationName,
            performedBy,
            note: data.note || `Kiểm kê điều chỉnh tồn kho (Chênh lệch: ${diff > 0 ? '+' : ''}${diff})`
          }
        });
      } else if (data.action === 'RECORD_LOST' && diff < 0) {
        const lostQty = Math.abs(diff);
        await tx.toolStock.update({
          where: { id: stock.id },
          data: {
            quantityAvailable: data.actualQuantity,
            quantityLost: { increment: lostQty }
          }
        });
        await tx.toolStockTransaction.create({
          data: {
            toolId: data.toolId,
            type: 'LOST',
            quantity: lostQty,
            fromLocation: data.locationName,
            performedBy,
            note: data.note || `Ghi nhận mất qua kiểm kê (Chênh lệch: -${lostQty})`
          }
        });
      }

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: data.toolId,
        action: 'ADJUST_STOCK' as any,
        details: { action: data.action, actual: data.actualQuantity, diff, location: data.locationName },
        performedBy,
        tx
      });
    });
  }

  static async splitStock(data: {
    toolId: number;
    fromLocation: string;
    splits: ToolSplitInput[];
    createChildCodes?: boolean;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const parentTool = await tx.toolEquipment.findUnique({ where: { id: data.toolId } });
      if (!parentTool) throw new Error('Không tìm thấy CCDC.');
      if (parentTool.managementType !== 'QUANTITY') {
        throw new Error('CCDC không phải loại quản lý số lượng.');
      }

      // Calculate total split quantity
      const totalSplitQty = data.splits.reduce((sum, s) => sum + s.quantity, 0);

      // Check source stock
      const sourceStock = await tx.toolStock.findUnique({
        where: { toolId_locationName: { toolId: data.toolId, locationName: data.fromLocation } }
      });
      if (!sourceStock || sourceStock.quantityAvailable < totalSplitQty) {
        throw new Error(`Số lượng khả dụng tại nguồn không đủ để thực hiện tách (Hiện có: ${sourceStock?.quantityAvailable || 0}, Cần tách: ${totalSplitQty}).`);
      }

      // 1. Decrement source stock
      await tx.toolStock.update({
        where: { id: sourceStock.id },
        data: { quantityAvailable: { decrement: totalSplitQty } }
      });

      // 2. Perform splits
      if (data.createChildCodes) {
        // Decrement parent's total quantity
        await tx.toolEquipment.update({
          where: { id: data.toolId },
          data: { quantity: { decrement: totalSplitQty } }
        });

        // Generate child codes starting with parentCode-
        const existingChildren = await tx.toolEquipment.findMany({
          where: { toolCode: { startsWith: `${parentTool.toolCode}-` } },
          select: { toolCode: true }
        });

        let maxSuffix = 0;
        for (const child of existingChildren) {
          const typed = child.toolCode.match(/-(?:I|G|B)(\d+)(?:-SL\d+)?$/i);
          const legacy = child.toolCode.match(/-(\d+)$/);
          const num = typed ? Number(typed[1]) : legacy ? Number(legacy[1]) : 0;
          if (!isNaN(num) && num > maxSuffix) {
            maxSuffix = num;
          }
        }

        let nextIndex = maxSuffix + 1;

        for (const splitItem of data.splits) {
          const qty = splitItem.quantity;
          const toLoc = splitItem.toLocation;
          const childDetails = Array.isArray(splitItem.childDetails) ? splitItem.childDetails : [];

          // Create qty number of individual tools
          for (let i = 0; i < qty; i++) {
            const childCode = `${parentTool.toolCode}-I${String(nextIndex).padStart(2, '0')}`;
            nextIndex++;

            const norm = parseAndNormalizeLocation(toLoc);
            const parentSpecs = parseJsonObject(parentTool.operationalSpecsJson);
            const parentCustomFields = parseJsonObject(parentTool.customFieldsJson);
            const variant = compactVariant(childDetails[i]);
            const operationalSpecs = {
              ...parentSpecs,
              color: variant.color || parentSpecs.color || undefined,
              childDescription: variant.description || undefined,
              identifyingFeature: variant.identifyingFeature || undefined,
              parentToolCode: parentTool.toolCode
            };
            const customFields = {
              ...parentCustomFields,
              childDescription: variant.description || undefined,
              identifyingFeature: variant.identifyingFeature || undefined
            };

            const childTool = await tx.toolEquipment.create({
              data: {
                toolCode: childCode,
                toolName: parentTool.toolName,
                category: parentTool.category,
                quantity: 1,
                unit: parentTool.unit,
                purchasePrice: parentTool.purchasePrice,
                purchaseDate: parentTool.purchaseDate,
                supplierName: parentTool.supplierName,
                currentUserName: null,
                departmentName: null,
                locationName: norm.fullFormatted,
                cityName: norm.city || parentTool.cityName,
                projectName: norm.project || parentTool.projectName,
                status: 'IN_STOCK',
                handoverDate: null,
                note: data.note || `Tách từ ${parentTool.toolCode}`,
                initialCondition: parentTool.initialCondition,
                industryAttributesJson: parentTool.industryAttributesJson,
                managementType: 'INDIVIDUAL',
                vat: parentTool.vat,
                shippingInstallCost: parentTool.shippingInstallCost,
                totalAmount: parentTool.totalAmount,
                fundingSource: parentTool.fundingSource,
                expectedUsefulLife: parentTool.expectedUsefulLife,
                expectedResidualValue: parentTool.expectedResidualValue,
                companyName: parentTool.companyName,
                branchName: parentTool.branchName,
                buildingName: parentTool.buildingName,
                floorName: parentTool.floorName,
                areaName: parentTool.areaName,
                specificLocation: parentTool.specificLocation,
                operationalSpecsJson: JSON.stringify(operationalSpecs),
                filesJson: parentTool.filesJson,
                warrantyInfoJson: parentTool.warrantyInfoJson,
                customFieldsJson: JSON.stringify(customFields)
              }
            });

            await tx.toolHistory.create({
              data: {
                toolId: childTool.id,
                toolCode: childTool.toolCode,
                eventTime: new Date(),
                actionType: 'CREATE',
                newStatus: childTool.status,
                newLocationName: childTool.locationName,
                newCityName: childTool.cityName,
                newNote: `Khởi tạo do tách từ CCDC số lượng ${parentTool.toolCode}`
              }
            });

            await AuditService.log({
              entityType: 'TOOL_EQUIPMENT',
              entityId: childTool.id,
              action: 'CREATE',
              details: { toolCode: childTool.toolCode, parentCode: parentTool.toolCode, variant },
              performedBy,
              tx
            });
          }

          // Create stock transaction for this split destination
          await tx.toolStockTransaction.create({
            data: {
              toolId: data.toolId,
              type: 'TRANSFER',
              quantity: qty,
              fromLocation: data.fromLocation,
              toLocation: toLoc,
              performedBy,
              note: data.note || `Tách ${qty} cái thành mã con tại ${toLoc}`
            }
          });
        }
      } else {
        // Do normal transfer splits (just stock transfers, no new code creation)
        for (const splitItem of data.splits) {
          const qty = splitItem.quantity;
          const toLoc = splitItem.toLocation;

          const norm = parseAndNormalizeLocation(toLoc);
          const normalizedToLoc = norm.fullFormatted;

          await tx.toolStock.upsert({
            where: { toolId_locationName: { toolId: data.toolId, locationName: normalizedToLoc } },
            create: {
              toolId: data.toolId,
              locationName: normalizedToLoc,
              quantityAvailable: qty
            },
            update: {
              quantityAvailable: { increment: qty }
            }
          });

          await tx.toolStockTransaction.create({
            data: {
              toolId: data.toolId,
              type: 'TRANSFER',
              quantity: qty,
              fromLocation: data.fromLocation,
              toLocation: normalizedToLoc,
              performedBy,
              note: data.note || `Tách số lượng: Chuyển ${qty} cái tới ${normalizedToLoc}`
            }
          });
        }
      }

      await tx.toolHistory.create({
        data: {
          toolId: parentTool.id,
          toolCode: parentTool.toolCode,
          eventTime: new Date(),
          actionType: 'TRANSFER',
          oldStatus: parentTool.status,
          newStatus: parentTool.status,
          oldLocationName: data.fromLocation,
          newLocationName: data.fromLocation,
          newNote: `Thực hiện tách ${totalSplitQty} cái sang địa điểm mới. (Tạo mã con: ${data.createChildCodes ? 'Có' : 'Không'})`
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: parentTool.id,
        action: 'TRANSFER_STOCK' as any,
        details: { from: data.fromLocation, totalSplitQty, createChildCodes: data.createChildCodes },
        performedBy,
        tx
      });
    });
  }

  static async mergeToolsIntoQuantity(data: {
    targetToolCode: string;
    sourceToolIds?: number[];
    sourceToolCodes?: string[];
    newToolName?: string;
    note?: string;
  }, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const sourceIds = (data.sourceToolIds || []).filter(Boolean);
      const sourceCodes = (data.sourceToolCodes || []).filter(Boolean);
      const sourceWhere: any[] = [{ toolCode: data.targetToolCode }];
      if (sourceIds.length) sourceWhere.push({ id: { in: sourceIds } });
      if (sourceCodes.length) sourceWhere.push({ toolCode: { in: sourceCodes } });

      const sources = await tx.toolEquipment.findMany({
        where: {
          isDeleted: false,
          OR: sourceWhere
        },
        include: { stocks: true }
      });

      if (sources.length < 2) {
        throw new Error('Can chon toi thieu 2 ma CCDC de gop.');
      }

      const targetTool = sources.find((tool: any) => tool.toolCode === data.targetToolCode);
      if (!targetTool) {
        throw new Error(`Không tìm thấy mã CCDC cha ${data.targetToolCode} trong các mã đang chọn. Vui lòng chọn đúng một mã từ danh sách đã chọn.`);
      }

      const totalQuantity = sources.reduce((sum: number, tool: any) => sum + Math.max(Number(tool.quantity) || 1, 1), 0);
      const parentSpecs = parseJsonObject(targetTool.operationalSpecsJson);
      const parentCustomFields = parseJsonObject(targetTool.customFieldsJson);

      const variants = sources.map((tool: any) => {
        const specs = parseJsonObject(tool.operationalSpecsJson);
        const customFields = parseJsonObject(tool.customFieldsJson);
        return {
          sourceToolId: tool.id,
          sourceToolCode: tool.toolCode,
          sourceToolName: tool.toolName,
          quantity: Math.max(Number(tool.quantity) || 1, 1),
          color: specs.color || customFields.color || null,
          description: specs.childDescription || customFields.childDescription || tool.note || null,
          identifyingFeature: specs.identifyingFeature || customFields.identifyingFeature || null
        };
      });

      const stockBuckets = new Map<string, any>();
      for (const tool of sources as any[]) {
        if (tool.stocks?.length) {
          for (const stock of tool.stocks) {
            const key = stock.locationName || tool.locationName || 'KHO CCDC';
            const bucket = stockBuckets.get(key) || {
              locationName: key,
              quantityAvailable: 0,
              quantityUsing: 0,
              quantityBroken: 0,
              quantityRepairing: 0,
              quantityLost: 0,
              quantityDestroyed: 0,
              quantityTransit: 0
            };
            bucket.quantityAvailable += stock.quantityAvailable || 0;
            bucket.quantityUsing += stock.quantityUsing || 0;
            bucket.quantityBroken += stock.quantityBroken || 0;
            bucket.quantityRepairing += stock.quantityRepairing || 0;
            bucket.quantityLost += stock.quantityLost || 0;
            bucket.quantityDestroyed += stock.quantityDestroyed || 0;
            bucket.quantityTransit += stock.quantityTransit || 0;
            stockBuckets.set(key, bucket);
          }
        } else {
          const key = tool.locationName || 'KHO CCDC';
          const bucket = stockBuckets.get(key) || {
            locationName: key,
            quantityAvailable: 0,
            quantityUsing: 0,
            quantityBroken: 0,
            quantityRepairing: 0,
            quantityLost: 0,
            quantityDestroyed: 0,
            quantityTransit: 0
          };
          const qty = Math.max(Number(tool.quantity) || 1, 1);
          if (tool.status === 'USING') bucket.quantityUsing += qty;
          else if (tool.status === 'DAMAGED') bucket.quantityBroken += qty;
          else if (tool.status === 'LOST') bucket.quantityLost += qty;
          else if (tool.status === 'LIQUIDATED') bucket.quantityDestroyed += qty;
          else bucket.quantityAvailable += qty;
          stockBuckets.set(key, bucket);
        }
      }

      const mergedLocations = Array.from(stockBuckets.keys());
      for (const stock of stockBuckets.values()) {
        await tx.toolStock.upsert({
          where: {
            toolId_locationName: {
              toolId: targetTool.id,
              locationName: stock.locationName
            }
          },
          create: { toolId: targetTool.id, ...stock },
          update: {
            quantityAvailable: stock.quantityAvailable,
            quantityUsing: stock.quantityUsing,
            quantityBroken: stock.quantityBroken,
            quantityRepairing: stock.quantityRepairing,
            quantityLost: stock.quantityLost,
            quantityDestroyed: stock.quantityDestroyed,
            quantityTransit: stock.quantityTransit
          }
        });
      }
      if (mergedLocations.length) {
        await tx.toolStock.deleteMany({
          where: {
            toolId: targetTool.id,
            locationName: { notIn: mergedLocations }
          }
        });
      }

      const updatedTarget = await tx.toolEquipment.update({
        where: { id: targetTool.id },
        data: {
          toolName: data.newToolName || targetTool.toolName,
          quantity: totalQuantity,
          managementType: 'QUANTITY',
          status: 'IN_STOCK',
          currentUserName: null,
          operationalSpecsJson: JSON.stringify({
            ...parentSpecs,
            mergedVariants: variants,
            mergedFromCodes: variants.map((variant: any) => variant.sourceToolCode)
          }),
          customFieldsJson: JSON.stringify({
            ...parentCustomFields,
            mergedVariantCount: variants.length,
            mergedFromCodes: variants.map((variant: any) => variant.sourceToolCode).join(', ')
          }),
          note: [targetTool.note, data.note || `Gop ${sources.length} ma CCDC thanh ma cha ${targetTool.toolCode}`]
            .filter(Boolean)
            .join(' | ')
        }
      });

      const sourceIdsToArchive = sources.filter((tool: any) => tool.id !== targetTool.id).map((tool: any) => tool.id);
      if (sourceIdsToArchive.length) {
        await tx.toolEquipment.updateMany({
          where: { id: { in: sourceIdsToArchive } },
          data: {
            isDeleted: true,
            note: `Da gop vao ${targetTool.toolCode}`
          }
        });
      }

      await tx.toolHistory.create({
        data: {
          toolId: targetTool.id,
          toolCode: targetTool.toolCode,
          eventTime: new Date(),
          actionType: 'UPDATE',
          newStatus: updatedTarget.status,
          newLocationName: updatedTarget.locationName,
          newNote: `Gop ma CCDC: ${variants.map((variant: any) => variant.sourceToolCode).join(', ')}`
        }
      });

      await AuditService.log({
        entityType: 'TOOL_EQUIPMENT',
        entityId: targetTool.id,
        action: 'UPDATE',
        details: { action: 'MERGE_TO_QUANTITY', targetToolCode: targetTool.toolCode, sourceCodes: variants.map((variant: any) => variant.sourceToolCode) },
        performedBy,
        tx
      });

      return updatedTarget;
    });
  }
}
