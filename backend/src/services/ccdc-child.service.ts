import prisma from '../utils/prisma';
import { AuditService } from './audit.service';

const CHILD_STATUSES = [
  'AVAILABLE',
  'IN_USE',
  'TRANSFERRING',
  'RETURNED',
  'DAMAGED',
  'REPAIRING',
  'LOST',
  'LIQUIDATED',
  'CANCELLED'
] as const;

const INVENTORY_STATUSES = ['PENDING', 'CHECKED', 'MISSING', 'NEED_REVIEW'] as const;

type ChildStatus = typeof CHILD_STATUSES[number];
type InventoryStatus = typeof INVENTORY_STATUSES[number];

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function hasBeenUsed(childItem: any) {
  return (
    childItem.hasHandover === true ||
    childItem.hasTransfer === true ||
    childItem.inventoryStatus === 'CHECKED' ||
    childItem.childStatus === 'IN_USE' ||
    childItem.childStatus === 'LIQUIDATED' ||
    childItem.childStatus === 'LOST'
  );
}

const assertStatus = (status: string, allowed: readonly string[], label: string) => {
  if (!allowed.includes(status)) {
    throw new Error(`${label} không hợp lệ.`);
  }
};

const compact = (value: any) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return value;
};

const parseChildSequence = (childCode: string) => {
  const typed = childCode.match(/-(?:I|G|B)(\d+)(?:-SL\d+)?$/i);
  if (typed) return Number(typed[1]);
  const legacy = childCode.match(/-(\d+)$/);
  return legacy ? Number(legacy[1]) : 0;
};

const childCodePrefixForSplitMode = (splitMode?: string) => {
  if (splitMode === 'quantity') return 'G';
  if (splitMode === 'combo') return 'B';
  return 'I';
};

const composeChildCode = (parentCode: string, seq: number, splitMode: string | undefined, quantity: number) => {
  const prefix = childCodePrefixForSplitMode(splitMode);
  const seqText = String(seq).padStart(2, '0');
  const qty = Math.max(1, Math.floor(Number(quantity || 1)));
  const quantitySuffix = prefix === 'I' ? '' : `-SL${qty}`;
  return `${parentCode}-${prefix}${seqText}${quantitySuffix}`;
};

export class CCDCChildService {
  static async getParentSummary(parentId: number, txClient?: any) {
    const client = txClient || prisma;
    const parent = await client.toolEquipment.findUnique({ where: { id: parentId } });
    if (!parent) throw new Error('Không tìm thấy CCDC cha.');

    const children = await client.cCDCChildItem.findMany({
      where: { parentCcdcId: parentId, deletedAt: null },
      select: { childStatus: true, quantity: true }
    });

    const count = (status: ChildStatus) => children
      .filter((item: any) => item.childStatus === status)
      .reduce((sum: number, item: any) => sum + Math.max(1, Math.floor(Number(item.quantity || 1))), 0);
    const createdQuantity = children
      .filter((item: any) => item.childStatus !== 'CANCELLED')
      .reduce((sum: number, item: any) => sum + Math.max(1, Math.floor(Number(item.quantity || 1))), 0);

    return {
      totalQuantity: parent.quantity || 0,
      createdChildCount: createdQuantity,
      childItemCount: children.length,
      availableCount: count('AVAILABLE'),
      inUseCount: count('IN_USE'),
      transferringCount: count('TRANSFERRING'),
      returnedCount: count('RETURNED'),
      damagedCount: count('DAMAGED'),
      repairingCount: count('REPAIRING'),
      lostCount: count('LOST'),
      liquidatedCount: count('LIQUIDATED'),
      cancelledCount: count('CANCELLED')
    };
  }

  private static async writeLogs(tx: any, params: {
    parentId: number;
    parentCode: string;
    childId: number;
    childCode: string;
    action: string;
    oldStatus?: string | null;
    newStatus?: string | null;
    performedBy: string;
    note?: string | null;
  }) {
    await tx.toolStockTransaction.create({
      data: {
        toolId: params.parentId,
        type: params.action,
        quantity: 1,
        performedBy: params.performedBy,
        note: [
          `Mã con: ${params.childCode}`,
          params.oldStatus && params.newStatus ? `${params.oldStatus} -> ${params.newStatus}` : null,
          params.note || null
        ].filter(Boolean).join(' | ')
      }
    });

    await tx.toolHistory.create({
      data: {
        toolId: params.parentId,
        toolCode: params.parentCode,
        eventTime: new Date(),
        actionType: params.action,
        oldStatus: params.oldStatus || null,
        newStatus: params.newStatus || null,
        oldNote: params.note || null,
        newNote: `Mã con ${params.childCode}`
      }
    });

    await AuditService.log({
      entityType: 'CCDC_CHILD_ITEM',
      entityId: params.childId,
      action: params.action === 'DELETE' ? 'DELETE' : params.action === 'CANCEL' ? 'CANCEL' : 'UPDATE',
      details: {
        parentId: params.parentId,
        parentCode: params.parentCode,
        childCode: params.childCode,
        oldStatus: params.oldStatus || null,
        newStatus: params.newStatus || null,
        note: params.note || null
      },
      performedBy: params.performedBy,
      tx
    });
  }

  private static operationResponse(child: any, oldStatus: string | null, summary: any, message = 'Thao tác thành công') {
    return {
      success: true,
      message,
      childId: child.id,
      childCode: child.childCode,
      oldStatus,
      newStatus: child.childStatus,
      updatedAt: child.updatedAt,
      summaryReady: true,
      parentSummary: summary
    };
  }

  static async list(parentId: number, params: any) {
    const page = Number(params.page || 1);
    const limit = Math.min(Number(params.limit || 50), 200);
    const skip = (page - 1) * limit;
    const sortBy = ['childCode', 'childStatus', 'inventoryStatus', 'location', 'department', 'user', 'color', 'lotNumber', 'createdAt', 'updatedAt'].includes(params.sortBy)
      ? params.sortBy
      : 'childCode';
    const sortOrder = params.sortOrder === 'desc' ? 'desc' : 'asc';

    const where: any = { parentCcdcId: parentId, deletedAt: null };
    if (params.status) where.childStatus = String(params.status);
    if (params.inventoryStatus) where.inventoryStatus = String(params.inventoryStatus);
    if (params.location) where.location = { contains: String(params.location), mode: 'insensitive' };
    if (params.department) where.department = { contains: String(params.department), mode: 'insensitive' };
    if (params.user) where.user = { contains: String(params.user), mode: 'insensitive' };
    if (params.color) where.color = { contains: String(params.color), mode: 'insensitive' };
    if (params.lotNumber) where.lotNumber = { contains: String(params.lotNumber), mode: 'insensitive' };
    if (params.search) {
      const search = String(params.search);
      where.OR = [
        { childCode: { contains: search, mode: 'insensitive' } },
        { parentCode: { contains: search, mode: 'insensitive' } },
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { user: { contains: search, mode: 'insensitive' } },
        { color: { contains: search, mode: 'insensitive' } },
        { lotNumber: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [items, total, summary] = await Promise.all([
      prisma.cCDCChildItem.findMany({ where, skip, take: limit, orderBy: { [sortBy]: sortOrder } }),
      prisma.cCDCChildItem.count({ where }),
      this.getParentSummary(parentId)
    ]);

    return { items, total, page, limit, summaryReady: true, parentSummary: summary };
  }

  static async createMany(parentId: number, data: any, performedBy: string) {
    const quantity = Number(data.quantity || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Số lượng mã con phải lớn hơn 0.');

    return await prisma.$transaction(async (tx) => {
      const parent = await tx.toolEquipment.findUnique({ where: { id: parentId } });
      if (!parent || parent.isDeleted) throw new Error('Không tìm thấy CCDC cha.');

      const activeChildren = await tx.cCDCChildItem.findMany({
        where: { parentCcdcId: parentId, deletedAt: null, childStatus: { not: 'CANCELLED' } },
        select: { quantity: true }
      });
      const rows = Array.isArray(data.items) && data.items.length
        ? data.items
        : Array.from({ length: data.splitMode === 'quantity' || data.splitMode === 'combo' ? 1 : quantity }, () => ({}));
      const requestedQuantity = rows.reduce((sum: number, row: any) => {
        const fallbackQuantity = data.splitMode === 'quantity' || data.splitMode === 'combo' ? quantity : 1;
        return sum + Math.max(1, Math.floor(Number(row.quantity || fallbackQuantity)));
      }, 0);
      const activeChildQuantity = activeChildren.reduce((sum: number, item: any) => sum + Math.max(1, Math.floor(Number(item.quantity || 1))), 0);
      const remaining = Math.max((parent.quantity || 0) - activeChildQuantity, 0);
      if (requestedQuantity > remaining) {
        throw new Error(`Số lượng tạo vượt quá số lượng chưa tách. Còn lại ${remaining}.`);
      }

      const existing = await tx.cCDCChildItem.findMany({
        where: { parentCcdcId: parentId },
        select: { childCode: true }
      });
      let maxSeq = 0;
      for (const item of existing) {
        maxSeq = Math.max(maxSeq, parseChildSequence(item.childCode));
      }

      const created = [];
      for (let i = 0; i < rows.length; i++) {
        const seq = maxSeq + i + 1;
        const row = rows[i] || {};
        const fallbackQuantity = data.splitMode === 'quantity' || data.splitMode === 'combo' ? quantity : 1;
        const rowQuantity = Math.max(1, Math.floor(Number(row.quantity || fallbackQuantity)));
        const childCode = composeChildCode(parent.toolCode, seq, data.splitMode, rowQuantity);
        const purchaseDateValue = row.purchaseDate || data.purchaseDate;
        const child = await tx.cCDCChildItem.create({
          data: {
            parentCcdcId: parent.id,
            parentCode: parent.toolCode,
            childCode,
            quantity: rowQuantity,
            lotNumber: compact(row.lotNumber) ?? compact(data.lotNumber),
            color: compact(row.color) ?? compact(data.color),
            size: compact(row.size) ?? compact(data.size),
            specification: compact(row.specification) ?? compact(data.specification),
            description: compact(row.description) ?? compact(data.description),
            serialNumber: compact(row.serialNumber) ?? compact(data.serialNumber),
            purchaseDate: purchaseDateValue ? new Date(purchaseDateValue) : null,
            supplierName: compact(row.supplierName) ?? compact(data.supplierName),
            imageUrl: compact(row.imageUrl) ?? compact(data.imageUrl),
            location: compact(row.location) ?? compact(data.location) ?? parent.locationName,
            department: compact(row.department) ?? compact(data.department) ?? parent.departmentName,
            user: compact(row.user) ?? compact(data.user) ?? parent.currentUserName,
            condition: compact(row.condition) ?? compact(data.condition) ?? parent.initialCondition,
            note: compact(row.note) ?? compact(data.note),
            createdBy: performedBy
          }
        });
        created.push(child);

        await tx.toolStockTransaction.create({
          data: {
            toolId: parent.id,
            type: 'CREATE_CHILD',
            quantity: rowQuantity,
            toLocation: child.location,
            performedBy,
            note: `Tạo mã con ${child.childCode} (SL: ${rowQuantity})`
          }
        });
      }

      await tx.toolHistory.create({
        data: {
          toolId: parent.id,
          toolCode: parent.toolCode,
          eventTime: new Date(),
          actionType: 'CREATE_CHILD',
          newStatus: parent.status,
          newNote: `Tạo ${created.length} mã con, tổng SL ${requestedQuantity}`
        }
      });

      await AuditService.log({
        entityType: 'CCDC_CHILD_ITEM',
        entityId: parent.id,
        action: 'CREATE',
        details: {
          parentCode: parent.toolCode,
          quantity: requestedQuantity,
          childItemCount: created.length,
          childCodes: created.map(item => item.childCode)
        },
        performedBy,
        tx
      });

      const summary = await this.getParentSummary(parent.id, tx);
      return {
        success: true,
        message: 'Tạo mã con thành công',
        items: created,
        createdCount: created.length,
        summaryReady: true,
        parentSummary: summary
      };
    }, { timeout: 30000 });
  }

  static async getDetail(childId: number, includeDeleted = false) {
    const child = await prisma.cCDCChildItem.findUnique({
      where: { id: childId },
      include: {
        parent: true,
        repairs: { orderBy: { createdAt: 'desc' } },
        attachments: { orderBy: { uploadedAt: 'desc' } }
      }
    });
    if (!child || (!includeDeleted && child.deletedAt)) throw new Error('Không tìm thấy mã con CCDC.');
    return child;
  }

  private static async updateStatus(childId: number, status: ChildStatus, performedBy: string, data: any = {}, action: string = status) {
    return await prisma.$transaction(async (tx) => {
      const oldChild = await tx.cCDCChildItem.findUnique({ where: { id: childId } });
      if (!oldChild || oldChild.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
      const updateData: any = {
        childStatus: status,
        note: compact(data.note) ?? oldChild.note
      };
      if (data.location !== undefined) updateData.location = compact(data.location);
      if (data.department !== undefined) updateData.department = compact(data.department);
      if (data.user !== undefined) updateData.user = compact(data.user);
      if (data.finalLocation !== undefined) updateData.location = compact(data.finalLocation);
      if (data.finalDepartment !== undefined) updateData.department = compact(data.finalDepartment);
      if (data.finalUser !== undefined) updateData.user = compact(data.finalUser);

      const child = await tx.cCDCChildItem.update({
        where: { id: childId },
        data: updateData
      });

      await this.writeLogs(tx, {
        parentId: child.parentCcdcId,
        parentCode: child.parentCode,
        childId: child.id,
        childCode: child.childCode,
        action,
        oldStatus: oldChild.childStatus,
        newStatus: child.childStatus,
        performedBy,
        note: data.note
      });

      const summary = await this.getParentSummary(child.parentCcdcId, tx);
      return this.operationResponse(child, oldChild.childStatus, summary);
    });
  }

  static async transfer(childId: number, data: any, performedBy: string) {
    return this.updateStatus(childId, 'TRANSFERRING', performedBy, data, 'TRANSFER');
  }

  static async completeTransfer(childId: number, data: any, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const oldChild = await tx.cCDCChildItem.findUnique({ where: { id: childId } });
      if (!oldChild || oldChild.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
      if (oldChild.childStatus !== 'TRANSFERRING') throw new Error('Chỉ hoàn tất được mã con đang điều chuyển.');

      const finalUser = compact(data.finalUser);
      const child = await tx.cCDCChildItem.update({
        where: { id: childId },
        data: {
          hasTransfer: true,
          childStatus: finalUser ? 'IN_USE' : 'AVAILABLE',
          location: compact(data.finalLocation) ?? oldChild.location,
          department: compact(data.finalDepartment) ?? oldChild.department,
          user: finalUser || null,
          note: compact(data.note) ?? oldChild.note
        }
      });

      await this.writeLogs(tx, {
        parentId: child.parentCcdcId,
        parentCode: child.parentCode,
        childId: child.id,
        childCode: child.childCode,
        action: 'COMPLETE_TRANSFER',
        oldStatus: oldChild.childStatus,
        newStatus: child.childStatus,
        performedBy,
        note: data.note
      });

      const summary = await this.getParentSummary(child.parentCcdcId, tx);
      return this.operationResponse(child, oldChild.childStatus, summary);
    });
  }

  static async handover(childId: number, data: any, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const oldChild = await tx.cCDCChildItem.findUnique({ where: { id: childId } });
      if (!oldChild || oldChild.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
      const child = await tx.cCDCChildItem.update({
        where: { id: childId },
        data: {
          hasHandover: true,
          childStatus: 'IN_USE',
          user: compact(data.user) ?? compact(data.finalUser) ?? oldChild.user,
          department: compact(data.department) ?? compact(data.finalDepartment) ?? oldChild.department,
          location: compact(data.location) ?? compact(data.finalLocation) ?? oldChild.location,
          note: compact(data.note) ?? oldChild.note
        }
      });

      await this.writeLogs(tx, {
        parentId: child.parentCcdcId,
        parentCode: child.parentCode,
        childId: child.id,
        childCode: child.childCode,
        action: 'HANDOVER',
        oldStatus: oldChild.childStatus,
        newStatus: child.childStatus,
        performedBy,
        note: data.note
      });

      const summary = await this.getParentSummary(child.parentCcdcId, tx);
      return this.operationResponse(child, oldChild.childStatus, summary);
    });
  }

  static async returnChild(childId: number, data: any, performedBy: string) {
    return this.updateStatus(childId, 'RETURNED', performedBy, { ...data, user: null }, 'RETURN');
  }

  static async confirmStockIn(childId: number, data: any, performedBy: string) {
    const oldChild = await prisma.cCDCChildItem.findUnique({ where: { id: childId } });
    if (!oldChild || oldChild.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
    if (oldChild.childStatus !== 'RETURNED') throw new Error('Chỉ mã con đã thu hồi mới được xác nhận nhập kho.');
    return this.updateStatus(childId, 'AVAILABLE', performedBy, { ...data, user: null }, 'CONFIRM_STOCK_IN');
  }

  static async reportDamage(childId: number, data: any, performedBy: string) {
    return this.updateStatus(childId, 'DAMAGED', performedBy, data, 'DAMAGE');
  }

  static async markLost(childId: number, data: any, performedBy: string) {
    await this.ensureApprovedRequest(childId, 'MARK_LOST', data.approvedRequestId);
    return this.updateStatus(childId, 'LOST', performedBy, data, 'LOST');
  }

  static async markFound(childId: number, data: any, performedBy: string) {
    const child = await prisma.cCDCChildItem.findUnique({ where: { id: childId } });
    if (!child || child.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
    if (child.childStatus !== 'LOST') throw new Error('Chỉ mã con đang báo mất mới được xác nhận tìm lại.');
    const restoredStatus: ChildStatus = child.user ? 'IN_USE' : 'AVAILABLE';
    return this.updateStatus(childId, restoredStatus, performedBy, data, 'FOUND');
  }

  static async liquidate(childId: number, data: any, performedBy: string) {
    await this.ensureApprovedRequest(childId, 'LIQUIDATE', data.approvedRequestId);
    return this.updateStatus(childId, 'LIQUIDATED', performedBy, data, 'LIQUIDATE');
  }

  static async cancel(childId: number, data: any, performedBy: string) {
    await this.ensureApprovedRequest(childId, 'CANCEL_CHILD', data.approvedRequestId);
    const reason = compact(data.reason || data.cancelledReason);
    if (!reason) throw new Error('Bắt buộc nhập lý do hủy mã con.');

    return await prisma.$transaction(async (tx) => {
      const oldChild = await tx.cCDCChildItem.findUnique({ where: { id: childId } });
      if (!oldChild || oldChild.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
      if (hasBeenUsed(oldChild)) throw new Error('Mã con đã sử dụng thực tế, không được hủy.');

      const child = await tx.cCDCChildItem.update({
        where: { id: childId },
        data: {
          childStatus: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: performedBy,
          cancelledReason: reason,
          note: reason
        }
      });

      await this.writeLogs(tx, {
        parentId: child.parentCcdcId,
        parentCode: child.parentCode,
        childId: child.id,
        childCode: child.childCode,
        action: 'CANCEL',
        oldStatus: oldChild.childStatus,
        newStatus: child.childStatus,
        performedBy,
        note: reason
      });

      const summary = await this.getParentSummary(child.parentCcdcId, tx);
      return this.operationResponse(child, oldChild.childStatus, summary);
    });
  }

  static async softDelete(childId: number, data: any, performedBy: string) {
    const reason = compact(data.reason);
    if (!reason) throw new Error('Bắt buộc nhập lý do xóa mã con.');

    return await prisma.$transaction(async (tx) => {
      const oldChild = await tx.cCDCChildItem.findUnique({ where: { id: childId } });
      if (!oldChild || oldChild.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
      if (hasBeenUsed(oldChild) || oldChild.isPrinted || oldChild.lastInventoryAt) {
        throw new Error('Mã con đã có giao dịch/in tem/kiểm kê/sử dụng, không được xóa.');
      }

      const child = await tx.cCDCChildItem.update({
        where: { id: childId },
        data: {
          deletedAt: new Date(),
          deletedBy: performedBy,
          note: reason
        }
      });

      await this.writeLogs(tx, {
        parentId: child.parentCcdcId,
        parentCode: child.parentCode,
        childId: child.id,
        childCode: child.childCode,
        action: 'DELETE',
        oldStatus: oldChild.childStatus,
        newStatus: child.childStatus,
        performedBy,
        note: reason
      });

      const summary = await this.getParentSummary(child.parentCcdcId, tx);
      return this.operationResponse(child, oldChild.childStatus, summary, 'Đã xóa mềm mã con.');
    });
  }

  static async inventoryCheck(childId: number, data: any, performedBy: string) {
    const inventoryStatus = String(data.inventoryStatus || 'CHECKED') as InventoryStatus;
    assertStatus(inventoryStatus, INVENTORY_STATUSES, 'Trạng thái kiểm kê');

    return await prisma.$transaction(async (tx) => {
      const oldChild = await tx.cCDCChildItem.findUnique({ where: { id: childId } });
      if (!oldChild || oldChild.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');

      const child = await tx.cCDCChildItem.update({
        where: { id: childId },
        data: {
          inventoryStatus,
          lastInventoryAt: new Date(),
          lastInventoryBy: performedBy,
          lastInventorySessionId: compact(data.lastInventorySessionId || data.sessionId),
          condition: compact(data.condition) ?? oldChild.condition,
          location: compact(data.location) ?? oldChild.location,
          department: compact(data.department) ?? oldChild.department,
          user: compact(data.user) ?? oldChild.user,
          note: compact(data.note) ?? oldChild.note
        }
      });

      await this.writeLogs(tx, {
        parentId: child.parentCcdcId,
        parentCode: child.parentCode,
        childId: child.id,
        childCode: child.childCode,
        action: 'INVENTORY_CHECK',
        oldStatus: oldChild.childStatus,
        newStatus: child.childStatus,
        performedBy,
        note: `Kiểm kê: ${inventoryStatus}${data.note ? ` | ${data.note}` : ''}`
      });

      const summary = await this.getParentSummary(child.parentCcdcId, tx);
      return this.operationResponse(child, oldChild.childStatus, summary);
    });
  }

  static async startRepair(childId: number, data: any, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const oldChild = await tx.cCDCChildItem.findUnique({ where: { id: childId } });
      if (!oldChild || oldChild.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
      if (oldChild.childStatus !== 'DAMAGED') throw new Error('Chỉ mã con DAMAGED mới được đưa đi sửa chữa.');

      const repairCount = await tx.cCDCChildRepair.count({ where: { childId } });
      const repair = await tx.cCDCChildRepair.create({
        data: {
          childId,
          repairCode: `SCR-${oldChild.childCode}-${String(repairCount + 1).padStart(2, '0')}`,
          vendorName: compact(data.vendorName),
          estimatedCost: data.estimatedCost ? Number(data.estimatedCost) : 0,
          damageDescription: compact(data.damageDescription),
          repairDescription: compact(data.note || data.repairDescription),
          expectedReturnDate: data.expectedReturnDate ? new Date(data.expectedReturnDate) : null,
          createdBy: performedBy
        }
      });

      const child = await tx.cCDCChildItem.update({
        where: { id: childId },
        data: { childStatus: 'REPAIRING', note: compact(data.note) ?? oldChild.note }
      });

      await this.writeLogs(tx, {
        parentId: child.parentCcdcId,
        parentCode: child.parentCode,
        childId: child.id,
        childCode: child.childCode,
        action: 'START_REPAIR',
        oldStatus: oldChild.childStatus,
        newStatus: child.childStatus,
        performedBy,
        note: data.note
      });

      const summary = await this.getParentSummary(child.parentCcdcId, tx);
      return { ...this.operationResponse(child, oldChild.childStatus, summary, 'Đã đưa mã con vào sửa chữa.'), repair };
    });
  }

  static async completeRepair(childId: number, data: any, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const oldChild = await tx.cCDCChildItem.findUnique({ where: { id: childId } });
      if (!oldChild || oldChild.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
      if (oldChild.childStatus !== 'REPAIRING') throw new Error('Chỉ mã con đang sửa chữa mới được hoàn tất sửa chữa.');

      const repair = await tx.cCDCChildRepair.findFirst({
        where: { childId, status: 'IN_PROGRESS' },
        orderBy: { createdAt: 'desc' }
      });
      if (!repair) throw new Error('Không tìm thấy phiếu sửa chữa đang mở.');

      const result = String(data.result || 'SUCCESS').toUpperCase();
      const failedNextStatus = String(data.nextStatus || 'DAMAGED').toUpperCase();
      if (result !== 'SUCCESS' && !['DAMAGED', 'LIQUIDATED'].includes(failedNextStatus)) {
        throw new Error('Kết quả sửa chữa thất bại chỉ được chuyển về DAMAGED hoặc LIQUIDATED.');
      }
      const newStatus = result === 'SUCCESS' ? 'AVAILABLE' : failedNextStatus;

      const updatedRepair = await tx.cCDCChildRepair.update({
        where: { id: repair.id },
        data: {
          actualCost: data.actualCost ? Number(data.actualCost) : 0,
          repairDescription: compact(data.note || data.repairDescription) ?? repair.repairDescription,
          completedDate: new Date(),
          status: result === 'SUCCESS' ? 'COMPLETED' : 'FAILED'
        }
      });

      const child = await tx.cCDCChildItem.update({
        where: { id: childId },
        data: { childStatus: newStatus, note: compact(data.note) ?? oldChild.note }
      });

      await this.writeLogs(tx, {
        parentId: child.parentCcdcId,
        parentCode: child.parentCode,
        childId: child.id,
        childCode: child.childCode,
        action: 'COMPLETE_REPAIR',
        oldStatus: oldChild.childStatus,
        newStatus: child.childStatus,
        performedBy,
        note: data.note
      });

      const summary = await this.getParentSummary(child.parentCcdcId, tx);
      return { ...this.operationResponse(child, oldChild.childStatus, summary, 'Đã hoàn tất sửa chữa.'), repair: updatedRepair };
    });
  }

  static async bulkAction(data: any, performedBy: string) {
    const childIds = Array.isArray(data.childIds) ? data.childIds.map((id: any) => Number(id)).filter(Boolean) : [];
    const action = String(data.action || '').toUpperCase();
    const payload = data.payload || {};
    if (!childIds.length) throw new Error('Chưa chọn mã con.');
    if (!['TRANSFER', 'HANDOVER', 'RETURN', 'PRINT_QR', 'INVENTORY_CHECK'].includes(action)) throw new Error('Bulk action không hợp lệ.');

    const details = [];
    for (const childId of childIds) {
      try {
        let result: any;
        if (action === 'TRANSFER') result = await this.transfer(childId, payload, performedBy);
        if (action === 'HANDOVER') result = await this.handover(childId, payload, performedBy);
        if (action === 'RETURN') result = await this.returnChild(childId, payload, performedBy);
        if (action === 'INVENTORY_CHECK') result = await this.inventoryCheck(childId, payload, performedBy);
        if (action === 'PRINT_QR') {
          const child = await prisma.cCDCChildItem.update({
            where: { id: childId },
            data: { isPrinted: true, printedAt: new Date(), printedBy: performedBy }
          });
          await AuditService.log({
            entityType: 'CCDC_CHILD_ITEM',
            entityId: child.id,
            action: 'PRINT',
            details: { childCode: child.childCode },
            performedBy
          });
          result = { childId: child.id, childCode: child.childCode };
        }
        details.push({ childId, success: true, result });
      } catch (err: any) {
        details.push({ childId, success: false, message: err.message });
      }
    }
    const success = details.filter(item => item.success).length;
    return { total: childIds.length, success, failed: childIds.length - success, details };
  }

  static async addAttachment(childId: number, data: any, performedBy: string) {
    const fileName = compact(data.fileName);
    const fileUrl = compact(data.fileUrl);
    if (!fileName || !fileUrl) throw new Error('Tên file và đường dẫn file là bắt buộc.');
    const child = await prisma.cCDCChildItem.findUnique({ where: { id: childId } });
    if (!child || child.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');

    const attachment = await prisma.cCDCChildAttachment.create({
      data: {
        childId,
        fileName,
        fileUrl,
        fileSize: data.fileSize ? Number(data.fileSize) : null,
        mimeType: compact(data.mimeType),
        fileType: compact(data.fileType),
        category: compact(data.category) || 'OTHER',
        uploadedBy: performedBy
      }
    });
    await AuditService.log({
      entityType: 'CCDC_CHILD_ATTACHMENT',
      entityId: attachment.id,
      action: 'CREATE',
      details: { childId, childCode: child.childCode, category: attachment.category, fileName },
      performedBy
    });
    return attachment;
  }

  static async listAttachments(childId: number) {
    return prisma.cCDCChildAttachment.findMany({ where: { childId }, orderBy: { uploadedAt: 'desc' } });
  }

  static async deleteAttachment(attachmentId: number, performedBy: string) {
    const attachment = await prisma.cCDCChildAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw new Error('Không tìm thấy hồ sơ đính kèm.');
    await prisma.cCDCChildAttachment.delete({ where: { id: attachmentId } });
    await AuditService.log({
      entityType: 'CCDC_CHILD_ATTACHMENT',
      entityId: attachmentId,
      action: 'DELETE',
      details: { childId: attachment.childId, fileName: attachment.fileName },
      performedBy
    });
    return { success: true };
  }

  static async getTimeline(childId: number) {
    const child = await prisma.cCDCChildItem.findUnique({ where: { id: childId }, include: { repairs: true } });
    if (!child) throw new Error('Không tìm thấy mã con CCDC.');
    const [histories, transactions, audits] = await Promise.all([
      prisma.toolHistory.findMany({
        where: { toolId: child.parentCcdcId, OR: [{ newNote: { contains: child.childCode } }, { oldNote: { contains: child.childCode } }] },
        orderBy: { eventTime: 'desc' }
      }),
      prisma.toolStockTransaction.findMany({
        where: { toolId: child.parentCcdcId, note: { contains: child.childCode } },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.auditLog.findMany({
        where: { entityType: { in: ['CCDC_CHILD_ITEM', 'CCDC_CHILD_ATTACHMENT'] }, OR: [{ entityId: childId }, { details: { contains: child.childCode } }] },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const repairEvents = child.repairs.flatMap((repair: any) => [
      { at: repair.startDate, action: 'START_REPAIR', performedBy: repair.createdBy, before: 'DAMAGED', after: 'REPAIRING', note: repair.repairDescription || repair.damageDescription },
      repair.completedDate ? { at: repair.completedDate, action: 'COMPLETE_REPAIR', performedBy: repair.createdBy, before: 'REPAIRING', after: repair.status, note: repair.repairDescription } : null
    ]).filter(Boolean);

    const events = [
      { at: child.createdAt, action: 'CREATE_CHILD', performedBy: child.createdBy, before: null, after: child.childStatus, note: `Tạo mã con ${child.childCode}` },
      ...histories.map((item: any) => ({ at: item.eventTime, action: item.actionType, performedBy: null, before: item.oldStatus, after: item.newStatus, note: item.oldNote || item.newNote })),
      ...transactions.map((item: any) => ({ at: item.createdAt, action: item.type, performedBy: item.performedBy, before: item.fromLocation, after: item.toLocation, note: item.note })),
      ...audits.map((item: any) => ({ at: item.createdAt, action: item.action, performedBy: item.performedBy, before: null, after: null, note: item.details })),
      ...repairEvents
    ].sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { childId, childCode: child.childCode, events };
  }

  static async getDashboard(params: any = {}) {
    const where: any = { deletedAt: null };
    if (params.department) where.department = { contains: String(params.department), mode: 'insensitive' };
    if (params.user) where.user = { contains: String(params.user), mode: 'insensitive' };
    if (params.location) where.location = { contains: String(params.location), mode: 'insensitive' };
    const children = await prisma.cCDCChildItem.findMany({ where, include: { parent: true } });
    const filtered = children.filter((child: any) => {
      const parent = child.parent || {};
      if (params.company && !(parent.companyName || '').toLowerCase().includes(String(params.company).toLowerCase())) return false;
      if (params.city && !(parent.branchName || parent.cityName || '').toLowerCase().includes(String(params.city).toLowerCase())) return false;
      if (params.project && !(parent.projectName || parent.buildingName || '').toLowerCase().includes(String(params.project).toLowerCase())) return false;
      return true;
    });
    const itemQuantity = (item: any) => Math.max(1, Math.floor(Number(item.quantity || 1)));
    const count = (status: string) => filtered
      .filter((item: any) => item.childStatus === status)
      .reduce((sum: number, item: any) => sum + itemQuantity(item), 0);
    const groupBy = (field: string) => filtered.reduce((acc: Record<string, number>, item: any) => {
      const key = item[field] || 'Chưa cập nhật';
      acc[key] = (acc[key] || 0) + itemQuantity(item);
      return acc;
    }, {});
    return {
      total: filtered.reduce((sum: number, item: any) => sum + itemQuantity(item), 0),
      inUse: count('IN_USE'),
      available: count('AVAILABLE'),
      transferring: count('TRANSFERRING'),
      returned: count('RETURNED'),
      damaged: count('DAMAGED'),
      repairing: count('REPAIRING'),
      lost: count('LOST'),
      liquidated: count('LIQUIDATED'),
      byStatus: CHILD_STATUSES.reduce((acc: Record<string, number>, status) => ({ ...acc, [status]: count(status) }), {}),
      byLocation: groupBy('location'),
      byDepartment: groupBy('department')
    };
  }

  static async getAlerts(days = 3) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const today = new Date();
    const [staleTransfers, staleReturns, overdueRepairs, damaged] = await Promise.all([
      prisma.cCDCChildItem.findMany({ where: { deletedAt: null, childStatus: 'TRANSFERRING', updatedAt: { lt: cutoff } } }),
      prisma.cCDCChildItem.findMany({ where: { deletedAt: null, childStatus: 'RETURNED', updatedAt: { lt: cutoff } } }),
      prisma.cCDCChildRepair.findMany({ where: { status: 'IN_PROGRESS', expectedReturnDate: { lt: today } }, include: { child: true } }),
      prisma.cCDCChildItem.findMany({ where: { deletedAt: null, childStatus: 'DAMAGED' } })
    ]);
    return [
      ...staleTransfers.map((child: any) => ({ type: 'TRANSFER_OVERDUE', childId: child.id, childCode: child.childCode, message: 'Điều chuyển chưa xác nhận nhận' })),
      ...staleReturns.map((child: any) => ({ type: 'RETURN_STOCK_IN_OVERDUE', childId: child.id, childCode: child.childCode, message: 'Thu hồi chưa nhập kho' })),
      ...overdueRepairs.map((repair: any) => ({ type: 'REPAIR_OVERDUE', childId: repair.childId, childCode: repair.child.childCode, repairCode: repair.repairCode, message: 'Sửa chữa quá hạn' })),
      ...damaged.map((child: any) => ({ type: 'DAMAGED_PENDING', childId: child.id, childCode: child.childCode, message: 'Tài sản hỏng chưa xử lý' }))
    ];
  }

  private static async ensureApprovedRequest(childId: number, requestType: string, approvalRequestId?: number) {
    if (!approvalRequestId) throw new Error('Nghiệp vụ này cần phê duyệt trước khi thực hiện.');
    const approval = await prisma.cCDCApprovalRequest.findUnique({ where: { id: Number(approvalRequestId) } });
    if (!approval || approval.childId !== childId || approval.requestType !== requestType || approval.status !== 'APPROVED') {
      throw new Error('Đề xuất phê duyệt không hợp lệ hoặc chưa được duyệt.');
    }
    return approval;
  }

  static async createApprovalRequest(childId: number, data: any, performedBy: string) {
    const child = await prisma.cCDCChildItem.findUnique({ where: { id: childId } });
    if (!child || child.deletedAt) throw new Error('Không tìm thấy mã con CCDC.');
    const requestType = String(data.requestType || '').toUpperCase();
    if (!['LIQUIDATE', 'MARK_LOST', 'CANCEL_CHILD', 'UPDATE_MASTER', 'RECHECK', 'ADJUST_ACTUAL_INFO'].includes(requestType)) {
      throw new Error('Loại đề xuất không hợp lệ.');
    }
    const reason = compact(data.reason);
    if (!reason) throw new Error('Bắt buộc nhập lý do đề xuất.');
    const approval = await prisma.cCDCApprovalRequest.create({
      data: {
        childId,
        parentId: child.parentCcdcId,
        requestType,
        oldData: JSON.stringify({
          location: child.location,
          department: child.department,
          user: child.user,
          serialNumber: child.serialNumber,
          condition: child.condition,
          childStatus: child.childStatus,
          note: child.note
        }),
        newData: data.newData ? JSON.stringify(data.newData) : null,
        reason,
        requestedBy: performedBy
      }
    });
    await AuditService.log({
      entityType: 'CCDC_APPROVAL_REQUEST',
      entityId: approval.id,
      action: 'REQUEST',
      details: { childId, childCode: child.childCode, requestType, reason },
      performedBy
    });
    return approval;
  }

  static async listApprovalRequests(params: any = {}) {
    const where: any = {};
    if (params.status) where.status = String(params.status).toUpperCase();
    if (params.requestType) where.requestType = String(params.requestType).toUpperCase();
    return prisma.cCDCApprovalRequest.findMany({
      where,
      include: { child: { include: { parent: true } } },
      orderBy: { requestedAt: 'desc' }
    });
  }

  static async approveRequest(id: number, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.cCDCApprovalRequest.findUnique({ where: { id }, include: { child: true } });
      if (!request) throw new Error('Không tìm thấy đề xuất.');
      if (request.status !== 'PENDING') throw new Error('Đề xuất đã được xử lý.');
      const approved = await tx.cCDCApprovalRequest.update({
        where: { id },
        data: { status: 'APPROVED', approvedBy: performedBy, approvedAt: new Date() }
      });
      const oldStatus = request.child.childStatus;
      let child = request.child;
      if (['UPDATE_MASTER', 'ADJUST_ACTUAL_INFO'].includes(request.requestType) && request.newData) {
        const payload = JSON.parse(request.newData);
        const allowedFields = ['location', 'department', 'user', 'serialNumber', 'condition', 'childStatus', 'note'];
        const updates = Object.fromEntries(Object.entries(payload).filter(([key]) => allowedFields.includes(key)));
        child = await tx.cCDCChildItem.update({ where: { id: request.childId }, data: updates });
      }
      if (request.requestType === 'MARK_LOST') {
        child = await tx.cCDCChildItem.update({ where: { id: request.childId }, data: { childStatus: 'LOST' } });
      }
      if (request.requestType === 'LIQUIDATE') {
        child = await tx.cCDCChildItem.update({ where: { id: request.childId }, data: { childStatus: 'LIQUIDATED' } });
      }
      if (request.requestType === 'CANCEL_CHILD') {
        child = await tx.cCDCChildItem.update({
          where: { id: request.childId },
          data: { childStatus: 'CANCELLED', cancelledAt: new Date(), cancelledBy: performedBy, cancelledReason: request.reason }
        });
      }
      if (child.childStatus !== oldStatus || ['UPDATE_MASTER', 'ADJUST_ACTUAL_INFO'].includes(request.requestType)) {
        await this.writeLogs(tx, {
          parentId: child.parentCcdcId,
          parentCode: child.parentCode,
          childId: child.id,
          childCode: child.childCode,
          action: `APPROVE_${request.requestType}`,
          oldStatus,
          newStatus: child.childStatus,
          performedBy,
          note: request.reason
        });
      }
      await AuditService.log({
        entityType: 'CCDC_APPROVAL_REQUEST',
        entityId: id,
        action: 'COMPLETE',
        details: { status: 'APPROVED', requestType: request.requestType, childId: request.childId },
        performedBy,
        tx
      });
      return approved;
    });
  }

  static async rejectRequest(id: number, data: any, performedBy: string) {
    const rejectReason = compact(data.rejectReason || data.reason);
    if (!rejectReason) throw new Error('Bắt buộc nhập lý do từ chối.');
    const rejected = await prisma.cCDCApprovalRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectedBy: performedBy, rejectedAt: new Date(), rejectReason }
    });
    await AuditService.log({
      entityType: 'CCDC_APPROVAL_REQUEST',
      entityId: id,
      action: 'CANCEL',
      details: { status: 'REJECTED', rejectReason },
      performedBy
    });
    return rejected;
  }

  static async batchScan(data: any, performedBy: string) {
    const barcodes: string[] = Array.isArray(data.barcodes) ? data.barcodes.map((item: any) => String(item).trim()).filter(Boolean) : [];
    if (!barcodes.length) throw new Error('Danh sách mã quét trống.');
    const batchId = data.batchId || `CCDC-SCAN-${Date.now()}`;
    const batch = await prisma.cCDCChildInventoryBatch.upsert({
      where: { batchId },
      update: { totalScanned: { increment: barcodes.length } },
      create: { batchId, scopeJson: data.scope ? JSON.stringify(data.scope) : null, totalScanned: barcodes.length, createdBy: performedBy }
    });
    const scope = data.scope || {};
    const scans = [];
    for (const barcode of barcodes) {
      const idMatch = barcode.match(/ccdc-child\/(\d+)/i);
      const child = idMatch
        ? await prisma.cCDCChildItem.findUnique({ where: { id: Number(idMatch[1]) } })
        : await prisma.cCDCChildItem.findFirst({ where: { OR: [{ childCode: barcode }, { serialNumber: barcode }] } });
      let scanStatus = 'OUT_OF_BOOK';
      let note = 'Không có trong sổ';
      if (child) {
        const already = await prisma.cCDCChildInventoryScan.findFirst({ where: { batchId, childId: child.id, scanStatus: { in: ['MATCH_PENDING_CONFIRM', 'CHECKED', 'ALREADY_CHECKED'] } } });
        if (already) {
          scanStatus = 'ALREADY_CHECKED';
          note = 'Đã quét trong batch';
        } else if ((scope.department && child.department !== scope.department) || (scope.location && child.location !== scope.location)) {
          scanStatus = 'OUT_OF_SCOPE';
          note = 'Ngoài phạm vi kiểm kê';
        } else {
          scanStatus = 'MATCH_PENDING_CONFIRM';
          note = 'Chờ xác nhận';
        }
      }
      scans.push(await prisma.cCDCChildInventoryScan.create({
        data: { batchId: batch.batchId, childId: child?.id, childCode: child?.childCode, barcode, scanStatus, note, scannedBy: performedBy }
      }));
    }
    return { batchId: batch.batchId, total: barcodes.length, scans };
  }

  static async batchProcess(batchId: string) {
    const scans = await prisma.cCDCChildInventoryScan.findMany({ where: { batchId } });
    const reviewCount = scans.filter(scan => ['OUT_OF_SCOPE', 'OUT_OF_BOOK', 'NEED_REVIEW'].includes(scan.scanStatus)).length;
    const processed = await prisma.cCDCChildInventoryBatch.update({
      where: { batchId },
      data: { status: 'NEED_REVIEW', processedCount: scans.length, reviewCount, processedAt: new Date() }
    });
    return { batch: processed, scans };
  }

  static async batchConfirm(batchId: string, performedBy: string) {
    return await prisma.$transaction(async (tx) => {
      const scans = await tx.cCDCChildInventoryScan.findMany({ where: { batchId, scanStatus: 'MATCH_PENDING_CONFIRM', childId: { not: null } } });
      for (const scan of scans) {
        await tx.cCDCChildItem.update({
          where: { id: scan.childId! },
          data: { inventoryStatus: 'CHECKED', lastInventoryAt: new Date(), lastInventoryBy: performedBy, lastInventorySessionId: batchId }
        });
        await tx.cCDCChildInventoryScan.update({
          where: { id: scan.id },
          data: { scanStatus: 'CHECKED', confirmedAt: new Date() }
        });
      }
      const batch = await tx.cCDCChildInventoryBatch.update({
        where: { batchId },
        data: { status: 'CHECKED', confirmedCount: scans.length, confirmedAt: new Date() }
      });
      return { batch, confirmed: scans.length };
    });
  }

  static async getBatch(batchId: string) {
    return prisma.cCDCChildInventoryBatch.findUnique({
      where: { batchId },
      include: { scans: { orderBy: { scannedAt: 'desc' }, include: { child: true } } }
    });
  }

  static async generateAlerts(days = 3) {
    const alerts = await this.getAlerts(days);
    const approvalCutoff = new Date();
    approvalCutoff.setDate(approvalCutoff.getDate() - days);
    const staleApprovals = await prisma.cCDCApprovalRequest.findMany({ where: { status: 'PENDING', requestedAt: { lt: approvalCutoff } } });
    const allAlerts = [
      ...alerts.map((alert: any) => ({ ...alert, severity: alert.type === 'REPAIR_OVERDUE' ? 'HIGH' : 'MEDIUM' })),
      ...staleApprovals.map((request: any) => ({ type: 'APPROVAL_OVERDUE', childId: request.childId, message: 'Đề xuất quá hạn chưa duyệt', severity: 'HIGH' }))
    ];
    const created = [];
    for (const alert of allAlerts) {
      const existing = await prisma.cCDCAlert.findFirst({ where: { childId: alert.childId, alertType: alert.type, status: 'OPEN' } });
      if (!existing) {
        created.push(await prisma.cCDCAlert.create({
          data: { childId: alert.childId, alertType: alert.type, severity: alert.severity || 'MEDIUM', message: alert.message }
        }));
      }
    }
    return created;
  }

  static async listPersistentAlerts(params: any = {}) {
    return prisma.cCDCAlert.findMany({
      where: { status: params.status || 'OPEN' },
      include: { child: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async resolveAlert(id: number, performedBy: string) {
    return prisma.cCDCAlert.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: performedBy }
    });
  }
}
