import { Router, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticateToken, requirePermission, AuthRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import ExcelJS from 'exceljs';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// --- CLOUDINARY CONFIG API ---
router.get('/cloudinary', authenticateToken, (req, res) => {
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "dhr0lgl8q",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || "ml_default"
  });
});

// --- COMPANY MANAGEMENT ---
router.get('/companies/stats', authenticateToken, async (req, res) => {
  try {
    const totalCompanies = await prisma.company.count();
    const activeCompanies = await prisma.company.count({
      where: { status: 'ACTIVE' }
    });
    const hiddenCompanies = await prisma.company.count({
      where: { status: 'HIDDEN' }
    });
    
    // Total assigned assets (companyCode not '00')
    const totalAssignedAssets = await prisma.asset.count({
      where: {
        isDeleted: false,
        companyCode: { not: '00' }
      }
    });

    // Unassigned assets (companyCode is '00')
    const unassignedAssets = await prisma.asset.count({
      where: {
        isDeleted: false,
        companyCode: '00'
      }
    });

    res.json({
      totalCompanies,
      activeCompanies,
      hiddenCompanies,
      totalAssignedAssets,
      unassignedAssets
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/companies/merge', authenticateToken, async (req: any, res) => {
  const { sourceCompanyId, targetCompanyId } = req.body;
  const username = req.user?.username || 'system';

  try {
    if (sourceCompanyId === targetCompanyId) {
      return res.status(400).json({ message: 'Công ty nguồn và đích không được giống nhau.' });
    }

    const sourceCompany = await prisma.company.findUnique({ where: { id: Number(sourceCompanyId) } });
    const targetCompany = await prisma.company.findUnique({ where: { id: Number(targetCompanyId) } });

    if (!sourceCompany || !targetCompany) {
      return res.status(404).json({ message: 'Không tìm thấy công ty nguồn hoặc công ty đích.' });
    }

    if (sourceCompany.code === '00' || targetCompany.code === '00') {
      return res.status(400).json({ message: 'Không cho phép gộp nhóm hệ thống.' });
    }

    // Query count of assets to be moved
    const assetCount = await prisma.asset.count({
      where: {
        companyCode: sourceCompany.code,
        isDeleted: false
      }
    });

    // Move assets
    await prisma.asset.updateMany({
      where: {
        companyCode: sourceCompany.code
      },
      data: {
        companyCode: targetCompany.code,
        companyName: targetCompany.name
      }
    });

    // Update source company status
    await prisma.company.update({
      where: { id: sourceCompany.id },
      data: {
        status: 'MERGED',
        mergedIntoId: targetCompany.id,
        isActive: false
      }
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        entityType: 'SETTINGS',
        entityId: sourceCompany.id,
        action: 'UPDATE',
        details: `Gộp công ty: Chuyển ${assetCount} tài sản từ [${sourceCompany.code}] ${sourceCompany.name} sang [${targetCompany.code}] ${targetCompany.name}`,
        performedBy: username
      }
    });

    res.json({ 
      message: `Gộp công ty thành công. Đã chuyển ${assetCount} tài sản sang công ty [${targetCompany.code}] ${targetCompany.name}.` 
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/companies', authenticateToken, async (req, res) => {
  try {
    const { search = '', status = '', type = '' } = req.query;
    
    // Build where filter
    const where: any = {};
    if (search) {
      where.OR = [
        { code: { contains: String(search), mode: 'insensitive' } },
        { name: { contains: String(search), mode: 'insensitive' } }
      ];
    }
    if (status) {
      where.status = String(status);
    }
    if (type) {
      where.type = String(type);
    }

    // Fetch companies
    const companies = await prisma.company.findMany({
      where,
      include: {
        parent: {
          select: { id: true, name: true, code: true }
        }
      },
      orderBy: { code: 'asc' }
    });

    // Fetch asset count and sum values for each company
    const assetStats = await prisma.asset.groupBy({
      by: ['companyCode'],
      _count: {
        id: true
      },
      _sum: {
        purchasePriceExVat: true
      },
      where: {
        isDeleted: false
      }
    });

    // Map stats back to companies
    const statsMap = new Map(assetStats.map(s => [s.companyCode, {
      count: s._count.id || 0,
      value: s._sum.purchasePriceExVat || 0
    }]));

    const result = companies.map(c => {
      const stats = statsMap.get(c.code) || { count: 0, value: 0 };
      return {
        ...c,
        assetCount: stats.count,
        assetValue: stats.value
      };
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/companies/active', authenticateToken, async (req, res) => {
  const companies = await prisma.company.findMany({
    where: { 
      isActive: true, 
      status: { in: ['ACTIVE', 'LOCKED'] }
    },
    orderBy: { code: 'asc' }
  });
  res.json(companies);
});

router.get('/companies/:id', authenticateToken, async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        parent: {
          select: { id: true, name: true, code: true }
        }
      }
    });
    if (!company) {
      return res.status(404).json({ message: 'Không tìm thấy công ty/đơn vị.' });
    }

    // Asset count and value
    const assetStats = await prisma.asset.aggregate({
      where: {
        companyCode: company.code,
        isDeleted: false
      },
      _count: {
        id: true
      },
      _sum: {
        purchasePriceExVat: true
      }
    });

    res.json({
      ...company,
      assetCount: assetStats._count.id || 0,
      assetValue: assetStats._sum.purchasePriceExVat || 0
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/companies/:id/assets', authenticateToken, async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: Number(req.params.id) }
    });
    if (!company) {
      return res.status(404).json({ message: 'Không tìm thấy công ty.' });
    }

    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {
      companyCode: company.code,
      isDeleted: false
    };

    if (search) {
      where.OR = [
        { assetCode: { contains: String(search), mode: 'insensitive' } },
        { assetName: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { assetCode: 'asc' }
      }),
      prisma.asset.count({ where })
    ]);

    res.json({
      assets,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/companies/:id/logs', authenticateToken, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: 'SETTINGS',
        entityId: Number(req.params.id)
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/companies', authenticateToken, async (req: any, res) => {
  const { code, name, type, parentId, taxCode, address, status, note } = req.body;
  const username = req.user?.username || 'system';

  try {
    // Check duplicate code
    const existing = await prisma.company.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: 'Mã công ty đã tồn tại.' });
    }

    const company = await prisma.company.create({
      data: {
        code,
        name,
        type: type || 'COMPANY',
        parentId: parentId ? Number(parentId) : null,
        taxCode,
        address,
        status: status || 'ACTIVE',
        note,
        createdBy: username,
        isActive: status !== 'HIDDEN' && status !== 'ARCHIVED'
      }
    });

    res.status(201).json(company);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/companies/:id', authenticateToken, async (req, res) => {
  const companyId = Number(req.params.id);
  const { name, type, parentId, taxCode, address, status, note, isActive } = req.body;

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ message: 'Không tìm thấy công ty.' });
    }

    // Rules: System record check
    if (company.code === '00') {
      return res.status(400).json({ message: 'Không được phép thay đổi thông tin của nhóm hệ thống.' });
    }

    // If status is changed to ARCHIVED, HIDDEN or ACTIVE, update isActive flag accordingly
    let finalIsActive = isActive;
    if (status !== undefined) {
      finalIsActive = status === 'ACTIVE' || status === 'LOCKED';
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        name,
        type,
        parentId: parentId ? Number(parentId) : null,
        taxCode,
        address,
        status,
        note,
        isActive: finalIsActive
      }
    });

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/companies/:id', authenticateToken, async (req, res) => {
  const companyId = Number(req.params.id);

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ message: 'Không tìm thấy công ty.' });
    }

    if (company.code === '00') {
      return res.status(400).json({ message: 'Không thể xóa nhóm hệ thống.' });
    }

    const assetCount = await prisma.asset.count({
      where: {
        companyCode: company.code,
        isDeleted: false
      }
    });

    if (assetCount > 0) {
      return res.status(400).json({ 
        message: `Không thể xóa đơn vị này vì đã có ${assetCount} tài sản gán với mã ${company.code}. Bạn có thể thay đổi trạng thái sang Ẩn (Hidden) hoặc Lưu trữ (Archived) thay thế.`
      });
    }

    await prisma.company.delete({ where: { id: companyId } });
    res.json({ message: 'Xóa công ty thành công.' });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Helper to sort categories by sortOrder then numeric code value
function sortCategories(list: any[]) {
  return list.sort((a, b) => {
    const aOrder = a.sortOrder || 0;
    const bOrder = b.sortOrder || 0;

    if (aOrder !== bOrder && aOrder !== 0 && bOrder !== 0) {
      return aOrder - bOrder;
    }

    const aNum = parseInt(a.code, 10);
    const bNum = parseInt(b.code, 10);

    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);

    if (aIsNum && bIsNum) {
      return aNum - bNum;
    }
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;

    return a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' });
  });
}

// --- CATEGORY MANAGEMENT ---
router.get('/categories', authenticateToken, async (req, res) => {
  const { level, parentId } = req.query;
  const where: any = {};
  if (level) where.level = Number(level);
  if (parentId) where.parentId = Number(parentId);

  const categories = await prisma.assetCategory.findMany({
    where
  });
  res.json(sortCategories(categories));
});

router.get('/categories/roots', authenticateToken, async (req, res) => {
  const categories = await prisma.assetCategory.findMany({
    where: { level: 1, parentId: null }
  });
  res.json(sortCategories(categories));
});

router.get('/categories/children/:parentId', authenticateToken, async (req, res) => {
  const categories = await prisma.assetCategory.findMany({
    where: { parentId: Number(req.params.parentId) }
  });
  res.json(sortCategories(categories));
});

// Export the entire four-level classification tree.  Keeping this on the
// server means the exported file is an exact snapshot of the master data.
router.get('/categories/export', authenticateToken, async (_req, res) => {
  try {
    const [categories, companies] = await Promise.all([
      prisma.assetCategory.findMany({
        orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }]
      }),
      prisma.company.findMany({
        orderBy: [{ code: 'asc' }],
        select: { code: true, name: true, status: true, isActive: true }
      })
    ]);
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QLTS Danko';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Phan loai tai san');

    worksheet.columns = [
      { key: 'companyScope', width: 24 },
      { key: 'level1Code', width: 14 },
      { key: 'level1Name', width: 32 },
      { key: 'level2Code', width: 14 },
      { key: 'level2Name', width: 32 },
      { key: 'level3Code', width: 14 },
      { key: 'level3Name', width: 32 },
      { key: 'level4Code', width: 14 },
      { key: 'level4Name', width: 36 },
      { key: 'slug', width: 30 },
      { key: 'status', width: 16 },
      { key: 'sortOrder', width: 12 }
    ];
    worksheet.addRow([
      'Công ty áp dụng', 'Mã cấp 1', 'Tên cấp 1', 'Mã cấp 2', 'Tên cấp 2', 'Mã cấp 3', 'Tên cấp 3',
      'Mã cấp 4', 'Tên cấp 4', 'Slug', 'Trạng thái', 'Thứ tự'
    ]);
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = { from: 'A1', to: 'L1' };

    for (const category of categories) {
      const chain: any[] = [];
      let current: any | undefined = category;
      while (current) {
        chain.unshift(current);
        current = current.parentId ? categoryById.get(current.parentId) : undefined;
      }
      const row: Record<string, string | number> = {
        companyScope: 'Tất cả công ty',
        slug: category.slug || '',
        status: category.isActive ? 'Đang hoạt động' : 'Tạm ẩn',
        sortOrder: category.sortOrder
      };
      chain.forEach((item) => {
        row[`level${item.level}Code`] = item.code;
        row[`level${item.level}Name`] = item.name;
      });
      worksheet.addRow(row);
    }
    worksheet.eachRow((row) => {
      row.alignment = { vertical: 'middle', wrapText: true };
    });

    const companyWorksheet = workbook.addWorksheet('Danh sach cong ty');
    companyWorksheet.columns = [
      { key: 'code', width: 16 },
      { key: 'name', width: 42 },
      { key: 'status', width: 20 }
    ];
    companyWorksheet.addRow(['Mã công ty', 'Tên công ty', 'Trạng thái']);
    companyWorksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    companyWorksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
    companyWorksheet.views = [{ state: 'frozen', ySplit: 1 }];
    companyWorksheet.autoFilter = { from: 'A1', to: 'C1' };
    companies.forEach((company) => {
      companyWorksheet.addRow({
        code: company.code,
        name: company.name,
        status: company.isActive && company.status === 'ACTIVE' ? 'Đang hoạt động' : company.status
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `phan-loai-tai-san-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (error: any) {
    res.status(500).json({ message: `Không thể xuất danh mục: ${error.message}` });
  }
});

// Rebuild the sequence counters from existing asset codes. This deliberately
// never rewrites an issued asset code; it only ensures the next code generated
// for each valid classification path continues from the highest used number.
router.post('/asset-code-rules/run', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const assets = await prisma.asset.findMany({
      select: {
        assetCode: true,
        companyCode: true,
        level1Code: true,
        level2Code: true,
        level3Code: true,
        level4Code: true,
        runningNo: true
      }
    });
    const sequences = new Map<string, number>();
    let skipped = 0;

    for (const asset of assets) {
      const parts = [asset.companyCode, asset.level1Code, asset.level2Code, asset.level3Code, asset.level4Code]
        .map((value) => String(value || '').trim());
      if (parts.some((value) => !value) || !asset.assetCode) {
        skipped += 1;
        continue;
      }
      const baseCode = parts.join('.');
      const prefix = `${baseCode}.`;
      if (!asset.assetCode.startsWith(prefix)) {
        skipped += 1;
        continue;
      }
      const finalSegment = asset.assetCode.slice(prefix.length);
      const parsedSequence = Number.parseInt(finalSegment, 10);
      if (!Number.isInteger(parsedSequence) || parsedSequence < 1) {
        skipped += 1;
        continue;
      }
      sequences.set(baseCode, Math.max(sequences.get(baseCode) || 0, parsedSequence, asset.runningNo || 0));
    }

    let updatedCounters = 0;
    await prisma.$transaction(async (tx) => {
      for (const [baseCode, lastNumber] of sequences) {
        const documentType = `ASSET_CODE_${baseCode}`;
        const existing = await tx.documentCounter.findUnique({ where: { documentType } });
        if (!existing) {
          await tx.documentCounter.create({ data: { documentType, lastNumber } });
          updatedCounters += 1;
        } else if (existing.lastNumber < lastNumber) {
          await tx.documentCounter.update({ where: { id: existing.id }, data: { lastNumber } });
          updatedCounters += 1;
        }
      }
    }, { timeout: 30000 });

    await AuditService.log({
      entityType: 'ASSET_CODE_RULE',
      entityId: 0,
      action: 'UPDATE',
      details: { processedAssets: assets.length, validPaths: sequences.size, updatedCounters, skipped },
      performedBy: req.user?.username || 'system'
    });

    res.json({
      message: 'Đã đồng bộ quy tắc tạo mã tài sản.',
      processedAssets: assets.length,
      validPaths: sequences.size,
      updatedCounters,
      skipped
    });
  } catch (error: any) {
    res.status(500).json({ message: `Không thể chạy quy tắc tạo mã: ${error.message}` });
  }
});

router.post('/categories', authenticateToken, async (req, res) => {
  const { code, name, slug, level, parentId, sortOrder, isActive } = req.body;
  try {
    // Validation: Level rules
    if (level > 1 && !parentId) return res.status(400).json({ message: "Parent ID is required for level > 1" });
    
    const normalizedCode = normalizeCode(code);

    // Check duplicate code under same parent
    const existing = await prisma.assetCategory.findFirst({
      where: { 
        code: { in: [code, normalizedCode] }, 
        level: Number(level), 
        parentId: parentId ? Number(parentId) : null 
      }
    });
    if (existing) {
      return res.status(400).json({ message: "Mã này đã tồn tại trong cùng cấp cha." });
    }

    const category = await prisma.assetCategory.create({
      data: { 
        code: normalizedCode, 
        name, 
        slug: slug || toSlug(name), 
        level: Number(level), 
        parentId: parentId ? Number(parentId) : null, 
        sortOrder: Number(sortOrder) || parseInt(normalizedCode, 10) || 999,
        isActive: isActive !== undefined ? isActive : true
      }
    });
    res.status(201).json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/categories/:id', authenticateToken, async (req, res) => {
  const { code, name, slug, isActive, sortOrder } = req.body;
  const categoryId = Number(req.params.id);

  try {
    const normalizedCode = code ? normalizeCode(code) : undefined;

    // Check if code change is allowed (if code is provided)
    if (normalizedCode) {
      const current = await prisma.assetCategory.findUnique({ where: { id: categoryId } });
      if (current && current.code !== normalizedCode) {
        // Check for usage in assets (pseudo-check, assuming Asset model tracking)
        const usageCount = await prisma.asset.count({
          where: {
            OR: [
              { level1Code: current.code, level1Name: current.name },
              { level2Code: current.code, level2Name: current.name },
              { level3Code: current.code, level3Name: current.name },
              { level4Code: current.code, level4Name: current.name }
            ]
          }
        });
        
        // In this implementation, we allow editing but warn on frontend. 
        // Backend strictly checks for unique constraint again if code is changed
        const duplicate = await prisma.assetCategory.findFirst({
          where: { 
            code: { in: [code, normalizedCode] }, 
            level: current.level, 
            parentId: current.parentId,
            id: { not: categoryId }
          }
        });
        if (duplicate) return res.status(400).json({ message: "Mã mới đã tồn tại ở cấp này." });
      }
    }

    const category = await prisma.assetCategory.update({
      where: { id: categoryId },
      data: { 
        code: normalizedCode, 
        name, 
        slug, 
        isActive, 
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : (normalizedCode ? (parseInt(normalizedCode, 10) || undefined) : undefined)
      }
    });
    res.json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Helper for slug generation
function toSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_');
}

function normalizeCode(rawCode: string): string {
  const num = parseInt(rawCode, 10);
  if (!isNaN(num) && num >= 1 && num <= 99) {
    return String(num).padStart(2, '0');
  }
  return rawCode.trim();
}

// --- EXCEL IMPORT ---
router.post('/categories/import', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer as any);
  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) return res.status(400).json({ message: "Worksheet not found" });

  let created = 0, updated = 0, errors = [];

  async function upsertCategory(code: string, name: string, userSlug: string | undefined, level: number, parentId: number | null) {
    const normalizedCode = normalizeCode(code);
    const slug = userSlug ? toSlug(userSlug) : toSlug(name);
    let sortOrder = parseInt(normalizedCode, 10);
    if (isNaN(sortOrder)) sortOrder = 999;

    const existing = await prisma.assetCategory.findFirst({
      where: {
        code: { in: [code, normalizedCode] },
        level,
        parentId
      }
    });

    if (existing) {
      const updatedCat = await prisma.assetCategory.update({
        where: { id: existing.id },
        data: { code: normalizedCode, name, slug, sortOrder, isActive: true }
      });
      return { cat: updatedCat, isNew: false };
    } else {
      const createdCat = await prisma.assetCategory.create({
        data: { code: normalizedCode, name, slug, level, parentId, sortOrder, isActive: true }
      });
      return { cat: createdCat, isNew: true };
    }
  }

  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const l1Code = row.getCell(1).text?.trim(); 
    const l1Name = row.getCell(2).text?.trim();
    const l1Slug = row.getCell(3).text?.trim();

    if (!l1Code || !l1Name) continue;

    try {
      const r1 = await upsertCategory(l1Code, l1Name, l1Slug, 1, null);
      if (r1.isNew) created++; else updated++;
      const cat1 = r1.cat;

      const l2Code = row.getCell(4).text?.trim();
      const l2Name = row.getCell(5).text?.trim();
      const l2Slug = row.getCell(6).text?.trim();

      if (l2Code && l2Name && cat1) {
        const r2 = await upsertCategory(l2Code, l2Name, l2Slug, 2, cat1.id);
        if (r2.isNew) created++; else updated++;
        const cat2 = r2.cat;
        
        const l3Code = row.getCell(7).text?.trim();
        const l3Name = row.getCell(8).text?.trim();
        const l3Slug = row.getCell(9).text?.trim();
        if (l3Code && l3Name && cat2) {
          const r3 = await upsertCategory(l3Code, l3Name, l3Slug, 3, cat2.id);
          if (r3.isNew) created++; else updated++;
          const cat3 = r3.cat;

          const l4Code = row.getCell(10).text?.trim();
          const l4Name = row.getCell(11).text?.trim();
          const l4Slug = row.getCell(12).text?.trim();
          if (l4Code && l4Name && cat3) {
            const r4 = await upsertCategory(l4Code, l4Name, l4Slug, 4, cat3.id);
            if (r4.isNew) created++; else updated++;
          }
        }
      }
    } catch (err: any) {
      errors.push({ row: i, message: err.message });
    }
  }

  res.json({ created, updated, errors });
});

// --- DEPARTMENT MANAGEMENT ---
router.get('/departments', authenticateToken, async (req, res) => {
  const depts = await prisma.department.findMany({ orderBy: { code: 'asc' } });
  res.json(depts);
});

// --- LOCATION MANAGEMENT ---
router.get('/locations', authenticateToken, async (req, res) => {
  const locs = await prisma.location.findMany({ orderBy: { code: 'asc' } });
  res.json(locs);
});

// --- PROJECT LOCATION HIERARCHY EXTENSIONS ---
router.get('/project-location-catalog', authenticateToken, async (_req, res) => {
  try {
    const entries = await prisma.projectLocationCatalog.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ cityName: 'asc' }, { projectName: 'asc' }]
    });
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ message: 'Không thể tải danh mục thành phố và dự án: ' + error.message });
  }
});

router.post(
  '/project-location-catalog',
  requirePermission('PERMISSION_MANAGE'),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const cityName = String(req.body.cityName || '').trim();
      const projectName = String(req.body.projectName || '').trim();
      const type = String(req.body.type || '').toUpperCase();

      if (!['CITY', 'PROJECT'].includes(type) || !cityName || (type === 'PROJECT' && !projectName)) {
        return res.status(400).json({ message: 'Thông tin thành phố hoặc dự án không hợp lệ.' });
      }
      if (cityName.length > 150 || projectName.length > 200) {
        return res.status(400).json({ message: 'Tên thành phố hoặc dự án vượt quá độ dài cho phép.' });
      }

      const normalizedProjectName = type === 'CITY' ? '' : projectName;
      const existing = await prisma.projectLocationCatalog.findFirst({
        where: {
          cityName: { equals: cityName, mode: 'insensitive' },
          projectName: { equals: normalizedProjectName, mode: 'insensitive' }
        }
      });
      if (existing?.status === 'ACTIVE') {
        return res.status(409).json({ message: type === 'CITY' ? 'Thành phố này đã tồn tại.' : 'Dự án này đã tồn tại trong thành phố đã chọn.' });
      }

      const entry = existing
        ? await prisma.projectLocationCatalog.update({
            where: { id: existing.id },
            data: { cityName, projectName: normalizedProjectName, status: 'ACTIVE', createdBy: req.user?.username || 'System' }
          })
        : await prisma.projectLocationCatalog.create({
            data: { cityName, projectName: normalizedProjectName, createdBy: req.user?.username || 'System' }
          });

      await AuditService.log({
        entityType: 'PROJECT_LOCATION_CATALOG',
        entityId: entry.id,
        action: 'CREATE',
        details: { type, cityName: entry.cityName, projectName: entry.projectName || null },
        performedBy: req.user?.username || 'System'
      });

      res.status(201).json(entry);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ message: 'Thành phố hoặc dự án này đã tồn tại.' });
      }
      res.status(500).json({ message: 'Không thể thêm thành phố hoặc dự án: ' + error.message });
    }
  }
);

router.get('/project-location-nodes', authenticateToken, async (req, res) => {
  try {
    const nodes = await prisma.projectLocationNode.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [
        { cityName: 'asc' },
        { projectName: 'asc' },
        { level: 'asc' },
        { name: 'asc' }
      ]
    });
    res.json(nodes);
  } catch (error: any) {
    res.status(500).json({ message: 'Không thể tải danh sách vị trí bổ sung: ' + error.message });
  }
});

router.post(
  '/project-location-nodes',
  requirePermission('PERMISSION_MANAGE'),
  async (req: AuthRequest, res: Response): Promise<any> => {
    try {
      const cityName = String(req.body.cityName || '').trim();
      const projectName = String(req.body.projectName || '').trim();
      const parentPath = String(req.body.parentPath || '').trim();
      const name = String(req.body.name || '').trim();
      const level = Number(req.body.level);

      if (!cityName || !projectName || !name || ![1, 2, 3, 4].includes(level)) {
        return res.status(400).json({
          message: 'Thành phố, dự án, tên vị trí và cấp vị trí không hợp lệ.'
        });
      }
      const parentSegments = parentPath
        .split(' / ')
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (level > 1 && parentSegments.length !== level - 1) {
        const parentLabels = ['Khu vực', 'Địa điểm / công trình', 'Tầng / khu chức năng'];
        return res.status(400).json({
          message: `Vui lòng chọn đầy đủ ${parentLabels.slice(0, level - 1).join(', ')} trước khi thêm vị trí.`
        });
      }
      if (name.length > 200) {
        return res.status(400).json({ message: 'Tên vị trí không được vượt quá 200 ký tự.' });
      }

      const node = await prisma.projectLocationNode.create({
        data: {
          cityName,
          projectName,
          parentPath: level === 1 ? '' : parentPath,
          name,
          level,
          createdBy: req.user?.username || 'System'
        }
      });

      await AuditService.log({
        entityType: 'PROJECT_LOCATION',
        entityId: node.id,
        action: 'CREATE',
        details: {
          cityName: node.cityName,
          projectName: node.projectName,
          parentPath: node.parentPath,
          name: node.name,
          level: node.level
        },
        performedBy: req.user?.username || 'System'
      });

      res.status(201).json(node);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(409).json({ message: 'Vị trí này đã tồn tại trong cùng cấp phân loại.' });
      }
      res.status(500).json({ message: 'Không thể thêm vị trí mới: ' + error.message });
    }
  }
);

export default router;
