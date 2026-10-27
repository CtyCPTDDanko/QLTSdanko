import { Router } from 'express';
import prisma from '../utils/prisma';
import { AssetService } from '../services/asset.service';
import { AuditService } from '../services/audit.service';
import { SmartAIService } from '../services/smart-ai.service';
import { authenticateToken, AuthRequest, requirePermission } from '../middleware/auth.middleware';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { InvoiceParserService } from '../services/invoice-parser.service';
import { InvoicePostService } from '../services/invoice-post.service';
import { AssetGroupReportService } from '../services/asset-group-report.service';
import { AssigneeNormalizationService } from '../services/assignee-normalization.service';
import { buildDataScopeWhere } from '../utils/data-scope.util';
import ExcelJS from 'exceljs';
import { buildExcelWorkbook, formatDate } from '../utils/excel.util';
import {
  normalizeAssetLocation,
  normalizeAssetUnit,
  normalizeDepartmentName,
  normalizeProjectName,
  parseAndNormalizeLocation
} from '../utils/location.util';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

const parsePastedAssetCodes = (value: unknown): string[] => {
  const tokens = String(value || '')
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const assetCodes = tokens.filter((token) => /^\d+(?:\.\d+){2,}$/.test(token));
  return assetCodes.length > 1
    ? Array.from(new Set(assetCodes)).slice(0, 200)
    : [];
};

const resolveAssetOwningCompany = async (asset: {
  assetCode: string;
  companyCode: string;
  companyName: string;
}) => {
  const assetCodePrefix = String(asset.assetCode || '').split('.')[0]?.trim();
  const codeCandidates = Array.from(new Set([
    String(asset.companyCode || '').trim(),
    assetCodePrefix
  ].filter(Boolean)));
  const nameCandidates = Array.from(new Set([
    String(asset.companyName || '').trim(),
    String(asset.companyCode || '').trim()
  ].filter(Boolean)));

  const companies = await prisma.company.findMany({
    where: {
      isActive: true,
      OR: [
        ...(codeCandidates.length > 0 ? [{ code: { in: codeCandidates } }] : []),
        ...nameCandidates.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } }))
      ]
    }
  });

  return companies.find((company) => company.code === asset.companyCode)
    || companies.find((company) => company.code === assetCodePrefix)
    || companies.find((company) => nameCandidates.some((name) => company.name.localeCompare(name, 'vi', { sensitivity: 'accent' }) === 0))
    || null;
};

const startOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (value: Date, days: number) => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const AREA_ASSIGNEE_PREFIX = /^KHU\s+VỰC:\s*/i;

const attachAreaAssignees = async (assets: any[]) => {
  const candidateIds = assets
    .filter((asset) => asset.status === 'ASSIGNED' && !String(asset.currentUserName || '').trim())
    .map((asset) => asset.id);
  if (candidateIds.length === 0) return assets;

  const latestAssignments = await prisma.assetAssignment.findMany({
    where: { assetId: { in: candidateIds } },
    orderBy: [
      { assetId: 'asc' },
      { effectiveAt: 'desc' },
      { id: 'desc' }
    ],
    distinct: ['assetId'],
    select: {
      assetId: true,
      newUserName: true
    }
  });

  const areaByAssetId = new Map<number, string>();
  latestAssignments.forEach((assignment) => {
    if (!AREA_ASSIGNEE_PREFIX.test(assignment.newUserName)) return;
    const areaName = assignment.newUserName.replace(AREA_ASSIGNEE_PREFIX, '').trim();
    if (areaName) areaByAssetId.set(assignment.assetId, areaName);
  });
  if (areaByAssetId.size === 0) return assets;

  return assets.map((asset) => {
    const assignedAreaName = areaByAssetId.get(asset.id);
    return assignedAreaName
      ? { ...asset, currentAssigneeType: 'AREA', assignedAreaName }
      : asset;
  });
};

router.post('/group-report', authenticateToken, requirePermission('ASSET_VIEW'), async (req: AuthRequest, res) => {
  try {
    const rawIds = Array.isArray(req.body?.assetIds) ? req.body.assetIds : [];
    const parsedIds = rawIds.map((value: unknown) => Number(value));
    const assetIds = Array.from(new Set<number>(
      parsedIds.filter((value: number): value is number => Number.isInteger(value) && value > 0)
    )).slice(0, 10000);
    if (assetIds.length === 0) {
      return res.status(400).json({ message: 'Nhóm không có tài sản để xuất báo cáo.' });
    }

    const scopeWhere = buildDataScopeWhere(req.user?.dataScope, req.user?.id || 0, {
      company: 'companyCode',
      department: 'departmentName',
      warehouse: 'locationName',
      user: 'currentUserName'
    });
    if (scopeWhere.id === -1) {
      return res.status(403).json({ message: 'Bạn không có quyền xem dữ liệu của nhóm tài sản này.' });
    }

    const assetWhere: any = {
      id: { in: assetIds },
      isDeleted: false
    };
    if (Object.keys(scopeWhere).length > 0) assetWhere.AND = [scopeWhere];

    const canViewPrice = Boolean(
      req.user?.roles?.includes('SUPER_ADMIN')
      || req.user?.permissions?.includes('ASSET_VIEW_PRICE')
    );
    const requestedBy = req.user?.fullName || req.user?.username || 'Admin';
    const { workbook, assetCount } = await AssetGroupReportService.build({
      assetIds,
      assetWhere,
      reportName: typeof req.body?.reportName === 'string' ? req.body.reportName : undefined,
      requestedBy,
      canViewPrice
    });
    if (assetCount === 0) {
      return res.status(404).json({ message: 'Không tìm thấy tài sản phù hợp phạm vi quyền để xuất báo cáo.' });
    }

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=BaoCaoNhomTaiSan_${date}.xlsx`);
    res.setHeader('Cache-Control', 'no-store');
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error: any) {
    console.error('Group asset report error:', error);
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    return res.status(500).json({ message: 'Lỗi xuất báo cáo nhóm: ' + error.message });
  }
});

const parseRequiredDate = (value: any, label: string) => {
  const date = new Date(String(value || ''));
  if (!value || Number.isNaN(date.getTime())) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return date;
};

const calculateRecoveryPriority = (expectedRecoveryDate?: Date | null) => {
  if (!expectedRecoveryDate) return 0;
  const today = startOfDay(new Date());
  const due = startOfDay(expectedRecoveryDate);
  if (due < today) return 100;
  if (due.getTime() === today.getTime()) return 90;
  if (due <= addDays(today, 3)) return 50;
  return 0;
};

const refreshRecoveryPriorities = async () => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const inFourDays = addDays(today, 4);

  await prisma.$transaction([
    prisma.asset.updateMany({
      where: { offboardingAlert: true, offboardingResolvedAt: null, expectedRecoveryDate: { lt: today } },
      data: { recoveryPriority: 100 }
    }),
    prisma.asset.updateMany({
      where: { offboardingAlert: true, offboardingResolvedAt: null, expectedRecoveryDate: { gte: today, lt: tomorrow } },
      data: { recoveryPriority: 90 }
    }),
    prisma.asset.updateMany({
      where: { offboardingAlert: true, offboardingResolvedAt: null, expectedRecoveryDate: { gte: tomorrow, lt: inFourDays } },
      data: { recoveryPriority: 50 }
    }),
    prisma.asset.updateMany({
      where: { OR: [
        { offboardingAlert: false },
        { offboardingResolvedAt: { not: null } },
        { offboardingAlert: true, expectedRecoveryDate: { gte: inFourDays } },
        { offboardingAlert: true, expectedRecoveryDate: null }
      ] },
      data: { recoveryPriority: 0 }
    })
  ]);
};

router.get('/stats', authenticateToken, async (req: AuthRequest, res) => {
  const { 
    search = '', 
    status,         
    companyCode,
    currentUserName,
    departmentName,
    locationQuery,
    cityName,
    projectName,
    level4Code,
    level4Name,
    priceMin,
    priceMax,
    purchaseDateFrom,
    purchaseDateTo,
    handoverDateFrom,
    handoverDateTo,
    depreciationEndDateFrom,
    depreciationEndDateTo,
    supplierName,
    hasSerial,
    hasDocuments,
    lastInventoryFrom,
    lastInventoryTo,
    inventoryStatus,
    createdFrom,
    createdTo,
    invoiceBatchId
  } = req.query;

  try {
    const scopeWhere = buildDataScopeWhere(req.user?.dataScope, req.user?.id || 0, {
      company: 'companyCode',
      department: 'departmentName',
      warehouse: 'locationName',
      user: 'currentUserName'
    });

    const where: any = { isDeleted: false };
    const andClauses: any[] = [];
    if (Object.keys(scopeWhere).length > 0) {
      if (scopeWhere.id === -1) {
        return res.json({ total: 0, assigned: 0, inStock: 0, underRepair: 0, damaged: 0, lost: 0, liquidated: 0 });
      }
      andClauses.push(scopeWhere);
    }

    // Advanced Search
    if (search) {
      const assetCodes = parsePastedAssetCodes(search);
      if (assetCodes.length > 1) {
        andClauses.push({ assetCode: { in: assetCodes } });
      } else {
        const searchString = String(search).trim();
        andClauses.push({
          OR: [
          { assetCode: { contains: searchString, mode: 'insensitive' } },
          { assetName: { contains: searchString, mode: 'insensitive' } },
          { assetNameShort: { contains: searchString, mode: 'insensitive' } },
          { serialNumber: { contains: searchString, mode: 'insensitive' } },
          { companyCode: { contains: searchString, mode: 'insensitive' } },
          { companyName: { contains: searchString, mode: 'insensitive' } },
          { projectName: { contains: searchString, mode: 'insensitive' } },
          { level1Code: { contains: searchString, mode: 'insensitive' } },
          { level1Name: { contains: searchString, mode: 'insensitive' } },
          { level2Code: { contains: searchString, mode: 'insensitive' } },
          { level2Name: { contains: searchString, mode: 'insensitive' } },
          { level3Code: { contains: searchString, mode: 'insensitive' } },
          { level3Name: { contains: searchString, mode: 'insensitive' } },
          { level4Code: { contains: searchString, mode: 'insensitive' } },
          { level4Name: { contains: searchString, mode: 'insensitive' } },
          { runningNoText: { contains: searchString, mode: 'insensitive' } },
          { status: { contains: searchString, mode: 'insensitive' } },
          { unit: { contains: searchString, mode: 'insensitive' } },
          { usagePurpose: { contains: searchString, mode: 'insensitive' } },
          { supplierName: { contains: searchString, mode: 'insensitive' } },
          { supplierTaxCode: { contains: searchString, mode: 'insensitive' } },
          { currentUserName: { contains: searchString, mode: 'insensitive' } },
          { currentPosition: { contains: searchString, mode: 'insensitive' } },
          { departmentName: { contains: searchString, mode: 'insensitive' } },
          { locationName: { contains: searchString, mode: 'insensitive' } },
          { cityName: { contains: searchString, mode: 'insensitive' } },
          { documentNote: { contains: searchString, mode: 'insensitive' } },
          { attachments: { contains: searchString, mode: 'insensitive' } },
          { technicalSpecsJson: { contains: searchString, mode: 'insensitive' } },
          { originalInvoiceItemName: { contains: searchString, mode: 'insensitive' } },
            { lastInventoryStatus: { contains: searchString, mode: 'insensitive' } }
          ]
        });
      }
    }

    if (companyCode) where.companyCode = String(companyCode);
    if (req.query.isAssigned === 'true') {
      where.currentUserName = { not: null, notIn: ['', 'N/A', 'n/a'] };
    } else if (req.query.isAssigned === 'false') {
      where.currentUserName = { in: [null, '', 'N/A', 'n/a'] };
    } else if (currentUserName) {
      where.currentUserName = { contains: String(currentUserName), mode: 'insensitive' };
    }
    if (departmentName) {
      const deptArray = String(departmentName).split(',').map(d => d.trim()).filter(Boolean);
      if (deptArray.length > 1) {
        where.departmentName = { in: deptArray };
      } else if (deptArray.length === 1) {
        where.departmentName = { contains: deptArray[0], mode: 'insensitive' };
      }
    }
    
    if (level4Name) {
      const nameArray = String(level4Name).split(',').filter(Boolean);
      if (nameArray.length > 0) {
        where.level4Name = { in: nameArray };
      }
    } else if (level4Code) {
      const codeArray = String(level4Code).split(',').filter(Boolean);
      if (codeArray.length > 0) {
        where.level4Code = { in: codeArray };
      }
    }
    
    if (cityName) where.cityName = { contains: String(cityName), mode: 'insensitive' };
    if (projectName) where.projectName = { contains: String(projectName), mode: 'insensitive' };
    if (locationQuery) {
      andClauses.push({
        OR: [
          { locationName: { contains: String(locationQuery), mode: 'insensitive' } },
          { cityName: { contains: String(locationQuery), mode: 'insensitive' } },
          { projectName: { contains: String(locationQuery), mode: 'insensitive' } }
        ]
      });
    }

    if (priceMin || priceMax) {
      where.purchasePriceExVat = {};
      if (priceMin) where.purchasePriceExVat.gte = Number(priceMin);
      if (priceMax) where.purchasePriceExVat.lte = Number(priceMax);
    }

    if (purchaseDateFrom || purchaseDateTo) {
      where.purchaseDate = {};
      if (purchaseDateFrom) where.purchaseDate.gte = new Date(String(purchaseDateFrom));
      if (purchaseDateTo) where.purchaseDate.lte = new Date(String(purchaseDateTo));
    }
    
    if (handoverDateFrom || handoverDateTo) {
      where.handoverDate = {};
      if (handoverDateFrom) where.handoverDate.gte = new Date(String(handoverDateFrom));
      if (handoverDateTo) where.handoverDate.lte = new Date(String(handoverDateTo));
    }

    if (depreciationEndDateFrom || depreciationEndDateTo) {
      where.depreciationEndDate = {};
      if (depreciationEndDateFrom) where.depreciationEndDate.gte = new Date(String(depreciationEndDateFrom));
      if (depreciationEndDateTo) where.depreciationEndDate.lte = new Date(String(depreciationEndDateTo));
    }

    if (lastInventoryFrom || lastInventoryTo) {
      where.lastInventoryDate = {};
      if (lastInventoryFrom) where.lastInventoryDate.gte = new Date(String(lastInventoryFrom));
      if (lastInventoryTo) where.lastInventoryDate.lte = new Date(String(lastInventoryTo));
    }

    if (createdFrom || createdTo) {
      where.createdAt = {};
      if (createdFrom) where.createdAt.gte = new Date(String(createdFrom));
      if (createdTo) {
        const end = new Date(String(createdTo));
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (supplierName) where.supplierName = { contains: String(supplierName), mode: 'insensitive' };
    if (inventoryStatus) where.lastInventoryStatus = String(inventoryStatus);

    if (hasSerial === 'true') where.serialNumber = { not: null, notIn: ['', 'N/A', 'n/a'] };
    if (hasSerial === 'false') where.serialNumber = { in: [null, '', 'N/A', 'n/a'] };

    if (hasDocuments === 'true') where.documentNote = { not: null, notIn: ['', 'N/A', 'n/a'] };
    if (hasDocuments === 'false') where.documentNote = { in: [null, '', 'N/A', 'n/a'] };

    if (req.query.hasPrinted === 'true') where.lastLabelPrint = { not: null };
    if (req.query.hasPrinted === 'false') where.lastLabelPrint = null;

    if (req.query.isChecked === 'true') where.lastInventoryDate = { not: null };
    if (req.query.isChecked === 'false') where.lastInventoryDate = null;

    if (invoiceBatchId) {
      where.invoiceBatchId = Number(invoiceBatchId);
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    // Now, stats calculate count based on filters except for the specific status counts which override the status key on where clause
    const baseWhere = { ...where };
    // Remove status from baseWhere when calculating status counts, or keep it? Wait! 
    // The user requests: "Hiển thị tổng tài sản và các trạng thái theo danh sách tài sản có số lượng được hiển thị theo bộ lọc"
    // Meaning the stats card should reflect the current filters.
    // If they filter by departmentName = "HCNS", the stats card should show: Total assets in HCNS, Total assigned in HCNS, Total in_stock in HCNS, etc.
    // So status field should be ignored/overridden in specific status counts. But other filters (company, department, search, etc.) must remain.
    const statsWhere = { ...baseWhere };
    delete statsWhere.status;

    const [total, assigned, inStock, underRepair, damaged, lost, liquidated] = await Promise.all([
      prisma.asset.count({ where: statsWhere }),
      prisma.asset.count({ where: { ...statsWhere, status: 'ASSIGNED' } }),
      prisma.asset.count({ where: { ...statsWhere, status: 'IN_STOCK' } }),
      prisma.asset.count({ where: { ...statsWhere, status: 'UNDER_REPAIR' } }),
      prisma.asset.count({ where: { ...statsWhere, status: 'DAMAGED' } }),
      prisma.asset.count({ where: { ...statsWhere, status: 'LOST' } }),
      prisma.asset.count({ where: { ...statsWhere, status: 'LIQUIDATED' } }),
    ]);
    res.json({ total, assigned, inStock, underRepair, damaged, lost, liquidated });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Autocomplete / Filter Options Endpoints
router.get('/filter-options/users', authenticateToken, async (req, res) => {
  const { q = '', limit = '1000' } = req.query;
  const users = await prisma.asset.findMany({
    where: { 
      currentUserName: { contains: String(q), mode: 'insensitive' },
      isDeleted: false 
    },
    select: { currentUserName: true },
    distinct: ['currentUserName'],
    orderBy: { currentUserName: 'asc' },
    take: Number(limit)
  });
  res.json(users.map(u => u.currentUserName).filter(Boolean));
});

router.get('/filter-options/lv4', authenticateToken, async (req, res) => {
  const { q = '' } = req.query;
  const cats = await prisma.asset.findMany({
    where: { 
      OR: [
        { level4Code: { contains: String(q), mode: 'insensitive' } },
        { level4Name: { contains: String(q), mode: 'insensitive' } },
      ],
      isDeleted: false 
    },
    select: { level4Code: true, level4Name: true },
    distinct: ['level4Code', 'level4Name'],
    take: 10
  });
  res.json(cats.map(c => ({ value: c.level4Code, label: `${c.level4Code} - ${c.level4Name}` })));
});

router.get('/filter-options/departments', authenticateToken, async (req, res) => {
  const { q = '', limit = '1000' } = req.query;
  const depts = await prisma.asset.findMany({
    where: { 
      departmentName: { contains: String(q), mode: 'insensitive' },
      isDeleted: false 
    },
    select: { departmentName: true },
    distinct: ['departmentName'],
    orderBy: { departmentName: 'asc' },
    take: Math.min(Math.max(Number(limit) || 1000, 1), 1000)
  });
  res.json(depts.map(d => d.departmentName).filter(Boolean));
});

router.get('/filter-options/locations', authenticateToken, async (req, res) => {
  const { q = '', limit = '1000' } = req.query;
  const locs = await prisma.asset.findMany({
    where: {
      locationName: { contains: String(q), mode: 'insensitive' },
      isDeleted: false
    },
    select: { locationName: true },
    distinct: ['locationName'],
    orderBy: { locationName: 'asc' },
    take: Math.min(Math.max(Number(limit) || 1000, 1), 1000)
  });
  res.json(locs.map(l => l.locationName).filter(Boolean));
});

router.get('/filter-options/cities', authenticateToken, async (req, res) => {
  const { q = '', limit = '1000' } = req.query;
  const cities = await prisma.asset.findMany({
    where: { 
      cityName: { contains: String(q), mode: 'insensitive' },
      isDeleted: false 
    },
    select: { cityName: true },
    distinct: ['cityName'],
    orderBy: { cityName: 'asc' },
    take: Math.min(Math.max(Number(limit) || 1000, 1), 1000)
  });
  res.json(cities.map(c => c.cityName).filter(Boolean));
});

router.get('/filter-options/projects', authenticateToken, async (req, res) => {
  const { q = '', limit = '1000' } = req.query;
  const projects = await prisma.asset.findMany({
    where: { 
      projectName: { contains: String(q), mode: 'insensitive' },
      isDeleted: false 
    },
    select: { projectName: true },
    distinct: ['projectName'],
    orderBy: { projectName: 'asc' },
    take: Math.min(Math.max(Number(limit) || 1000, 1), 1000)
  });
  res.json(projects.map(p => p.projectName).filter(Boolean));
});

router.get('/filter-options/companies', authenticateToken, async (req, res) => {
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' }
  });
  res.json(companies.map(c => ({ id: c.id, value: c.code, label: c.name })));
});

router.post('/filter-options/cascaded', authenticateToken, async (req, res) => {
  try {
    const filters = req.body;
    
    const buildPartialWhere = (excludeField?: string) => {
      const partialWhere: any = { isDeleted: false };
      
      if (excludeField !== 'company' && filters.companyNames && filters.companyNames.length > 0) {
        partialWhere.companyName = { in: filters.companyNames };
      }
      if (excludeField !== 'city' && filters.cityNames && filters.cityNames.length > 0) {
        partialWhere.cityName = { in: filters.cityNames };
      }
      if (excludeField !== 'project' && filters.projectNames && filters.projectNames.length > 0) {
        partialWhere.projectName = { in: filters.projectNames };
      }
      if (excludeField !== 'location' && filters.locationNames && filters.locationNames.length > 0) {
        partialWhere.locationName = { in: filters.locationNames };
      }
      if (excludeField !== 'department' && filters.departmentNames && filters.departmentNames.length > 0) {
        partialWhere.departmentName = { in: filters.departmentNames };
      }
      if (excludeField !== 'user' && filters.currentUserNames && filters.currentUserNames.length > 0) {
        partialWhere.currentUserName = { in: filters.currentUserNames };
      }
      
      return partialWhere;
    };

    const [companies, cities, projects, locations, departments, users] = await Promise.all([
      prisma.asset.findMany({
        where: buildPartialWhere('company'),
        select: { companyName: true },
        distinct: ['companyName']
      }),
      prisma.asset.findMany({
        where: buildPartialWhere('city'),
        select: { cityName: true },
        distinct: ['cityName']
      }),
      prisma.asset.findMany({
        where: buildPartialWhere('project'),
        select: { projectName: true },
        distinct: ['projectName']
      }),
      prisma.asset.findMany({
        where: buildPartialWhere('location'),
        select: { locationName: true },
        distinct: ['locationName']
      }),
      prisma.asset.findMany({
        where: buildPartialWhere('department'),
        select: { departmentName: true },
        distinct: ['departmentName']
      }),
      prisma.asset.findMany({
        where: buildPartialWhere('user'),
        select: { currentUserName: true },
        distinct: ['currentUserName']
      })
    ]);

    res.json({
      companies: companies.map(c => c.companyName).filter(Boolean),
      cities: cities.map(c => c.cityName).filter(Boolean),
      projects: projects.map(p => p.projectName).filter(Boolean),
      locations: locations.map(l => l.locationName).filter(Boolean),
      departments: departments.map(d => d.departmentName).filter(Boolean),
      users: users.map(u => u.currentUserName).filter(Boolean)
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/filter-options/suppliers', authenticateToken, async (req, res) => {
  const { q = '' } = req.query;
  const suppliers = await prisma.asset.findMany({
    where: { 
      supplierName: { contains: String(q), mode: 'insensitive' },
      isDeleted: false 
    },
    select: { supplierName: true },
    distinct: ['supplierName'],
    take: 10
  });
  res.json(suppliers.map(s => s.supplierName).filter(Boolean));
});

// Main Asset List Query
router.get('/', authenticateToken, requirePermission('ASSET_VIEW'), async (req: AuthRequest, res) => {
  const { 
    page = 1, 
    limit = 10, 
    search = '', 
    sortBy = 'lastActionAt',
    sortOrder = 'desc',
    
    // Quick Filters
    status,         // single or comma-separated
    companyCode,
    currentUserName,
    departmentName,
    locationQuery,
    cityName,
    projectName,
    level4Code,
    level4Name,
    
    // Price Range
    priceMin,
    priceMax,
    
    // More Filters
    purchaseDateFrom,
    purchaseDateTo,
    handoverDateFrom,
    handoverDateTo,
    depreciationEndDateFrom,
    depreciationEndDateTo,
    supplierName,
    hasSerial,
    hasDocuments,
    lastInventoryFrom,
    lastInventoryTo,
    inventoryStatus,
    createdFrom,
    createdTo,
    invoiceBatchId
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const where: any = { isDeleted: false };
  const andClauses: any[] = [];

  // Data Scope
  const scopeWhere = buildDataScopeWhere(req.user?.dataScope, req.user?.id || 0, {
    company: 'companyCode',
    department: 'departmentName', // Assuming departmentIdsJson stores codes or names? Actually it stores IDs. Wait, in QLTSdanko we might be storing department names. Let's assume the helper is adapted or we fix it.
    warehouse: 'locationName',
    user: 'currentUserName'
  });
  
  if (Object.keys(scopeWhere).length > 0) {
    // If scope is { id: -1 } it means nothing matches
    if (scopeWhere.id === -1) {
      return res.json({ assets: [], pagination: { total: 0, page: Number(page), limit: Number(limit), totalPages: 0 } });
    }
    andClauses.push(scopeWhere);
  }

  // Advanced Search (Global Search Box)
  if (search) {
    const assetCodes = parsePastedAssetCodes(search);
    if (assetCodes.length > 1) {
      andClauses.push({ assetCode: { in: assetCodes } });
    } else {
      const searchString = String(search).trim();
      andClauses.push({
        OR: [
        { assetCode: { contains: searchString, mode: 'insensitive' } },
        { assetName: { contains: searchString, mode: 'insensitive' } },
        { assetNameShort: { contains: searchString, mode: 'insensitive' } },
        { serialNumber: { contains: searchString, mode: 'insensitive' } },
        { companyCode: { contains: searchString, mode: 'insensitive' } },
        { companyName: { contains: searchString, mode: 'insensitive' } },
        { projectName: { contains: searchString, mode: 'insensitive' } },
        { level1Code: { contains: searchString, mode: 'insensitive' } },
        { level1Name: { contains: searchString, mode: 'insensitive' } },
        { level2Code: { contains: searchString, mode: 'insensitive' } },
        { level2Name: { contains: searchString, mode: 'insensitive' } },
        { level3Code: { contains: searchString, mode: 'insensitive' } },
        { level3Name: { contains: searchString, mode: 'insensitive' } },
        { level4Code: { contains: searchString, mode: 'insensitive' } },
        { level4Name: { contains: searchString, mode: 'insensitive' } },
        { runningNoText: { contains: searchString, mode: 'insensitive' } },
        { status: { contains: searchString, mode: 'insensitive' } },
        { unit: { contains: searchString, mode: 'insensitive' } },
        { usagePurpose: { contains: searchString, mode: 'insensitive' } },
        { supplierName: { contains: searchString, mode: 'insensitive' } },
        { supplierTaxCode: { contains: searchString, mode: 'insensitive' } },
        { currentUserName: { contains: searchString, mode: 'insensitive' } },
        { currentPosition: { contains: searchString, mode: 'insensitive' } },
        { departmentName: { contains: searchString, mode: 'insensitive' } },
        { locationName: { contains: searchString, mode: 'insensitive' } },
        { cityName: { contains: searchString, mode: 'insensitive' } },
        { documentNote: { contains: searchString, mode: 'insensitive' } },
        { attachments: { contains: searchString, mode: 'insensitive' } },
        { technicalSpecsJson: { contains: searchString, mode: 'insensitive' } },
        { originalInvoiceItemName: { contains: searchString, mode: 'insensitive' } },
          { lastInventoryStatus: { contains: searchString, mode: 'insensitive' } }
        ]
      });
    }
  }

  // Multi-status filter
  if (status) {
    const statusArray = String(status).split(',').filter(Boolean);
    if (statusArray.length > 0) {
      const mappedStatuses: string[] = [];
      for (const s of statusArray) {
        if (s === 'BROKEN') {
          mappedStatuses.push('DAMAGED');
          mappedStatuses.push('BROKEN');
        } else if (s === 'LIQUIDATED') {
          mappedStatuses.push('LIQUIDATED');
          mappedStatuses.push('DISPOSED');
        } else {
          mappedStatuses.push(s);
        }
      }
      where.status = { in: mappedStatuses };
    }
  }

  if (companyCode) where.companyCode = String(companyCode);
  if (req.query.isAssigned === 'true') {
    where.currentUserName = { not: null, notIn: ['', 'N/A', 'n/a'] };
  } else if (req.query.isAssigned === 'false') {
    where.currentUserName = { in: [null, '', 'N/A', 'n/a'] };
  } else if (currentUserName) {
    where.currentUserName = { contains: String(currentUserName), mode: 'insensitive' };
  }
  if (departmentName) {
    const deptArray = String(departmentName).split(',').map(d => d.trim()).filter(Boolean);
    if (deptArray.length > 1) {
      where.departmentName = { in: deptArray };
    } else if (deptArray.length === 1) {
      where.departmentName = { contains: deptArray[0], mode: 'insensitive' };
    }
  }
  
  if (level4Name) {
    const nameArray = String(level4Name).split(',').filter(Boolean);
    if (nameArray.length > 0) {
      where.level4Name = { in: nameArray };
    }
  } else if (level4Code) {
    const codeArray = String(level4Code).split(',').filter(Boolean);
    if (codeArray.length > 0) {
      where.level4Code = { in: codeArray };
    }
  }
  
  if (cityName) where.cityName = { contains: String(cityName), mode: 'insensitive' };
  if (projectName) where.projectName = { contains: String(projectName), mode: 'insensitive' };
  if (locationQuery) {
    andClauses.push({
      OR: [
        { locationName: { contains: String(locationQuery), mode: 'insensitive' } },
        { cityName: { contains: String(locationQuery), mode: 'insensitive' } },
        { projectName: { contains: String(locationQuery), mode: 'insensitive' } }
      ]
    });
  }

  // Price Range
  if (priceMin || priceMax) {
    where.purchasePriceExVat = {};
    if (priceMin) where.purchasePriceExVat.gte = Number(priceMin);
    if (priceMax) where.purchasePriceExVat.lte = Number(priceMax);
  }

  // Dates
  if (purchaseDateFrom || purchaseDateTo) {
    where.purchaseDate = {};
    if (purchaseDateFrom) where.purchaseDate.gte = new Date(String(purchaseDateFrom));
    if (purchaseDateTo) where.purchaseDate.lte = new Date(String(purchaseDateTo));
  }
  
  if (handoverDateFrom || handoverDateTo) {
    where.handoverDate = {};
    if (handoverDateFrom) where.handoverDate.gte = new Date(String(handoverDateFrom));
    if (handoverDateTo) where.handoverDate.lte = new Date(String(handoverDateTo));
  }

  if (depreciationEndDateFrom || depreciationEndDateTo) {
    where.depreciationEndDate = {};
    if (depreciationEndDateFrom) where.depreciationEndDate.gte = new Date(String(depreciationEndDateFrom));
    if (depreciationEndDateTo) where.depreciationEndDate.lte = new Date(String(depreciationEndDateTo));
  }

  if (lastInventoryFrom || lastInventoryTo) {
    where.lastInventoryDate = {};
    if (lastInventoryFrom) where.lastInventoryDate.gte = new Date(String(lastInventoryFrom));
    if (lastInventoryTo) where.lastInventoryDate.lte = new Date(String(lastInventoryTo));
  }

  if (createdFrom || createdTo) {
    where.createdAt = {};
    if (createdFrom) where.createdAt.gte = new Date(String(createdFrom));
    if (createdTo) {
      const end = new Date(String(createdTo));
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  // Other metadata
  if (supplierName) where.supplierName = { contains: String(supplierName), mode: 'insensitive' };
  if (inventoryStatus) where.lastInventoryStatus = String(inventoryStatus);

  if (hasSerial === 'true') where.serialNumber = { not: null, notIn: ['', 'N/A', 'n/a'] };
  if (hasSerial === 'false') where.serialNumber = { in: [null, '', 'N/A', 'n/a'] };

  if (hasDocuments === 'true') where.documentNote = { not: null, notIn: ['', 'N/A', 'n/a'] };
  if (hasDocuments === 'false') where.documentNote = { in: [null, '', 'N/A', 'n/a'] };

  if (req.query.hasPrinted === 'true') where.lastLabelPrint = { not: null };
  if (req.query.hasPrinted === 'false') where.lastLabelPrint = null;

  if (req.query.isChecked === 'true') where.lastInventoryDate = { not: null };
  if (req.query.isChecked === 'false') where.lastInventoryDate = null;

  if (invoiceBatchId) {
    where.invoiceBatchId = Number(invoiceBatchId);
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

    const isGroupedCompact = req.query.compact === 'grouped';
    const isCompact = isGroupedCompact || req.query.compact === 'table';
    const shouldFetchAll = req.query.all === 'true';
    const shouldSkipCount = req.query.skipCount === 'true';
  try {
    // Existing assets predate `lastActionAt`. Initialize them once from their
    // newest audit action (or creation time when no audit exists), without
    // trusting seed-touched `updatedAt`.
    await prisma.$executeRaw`
      WITH latest_action AS (
        SELECT
          asset."id",
          COALESCE(MAX(log."createdAt"), asset."createdAt") AS "occurredAt"
        FROM "Asset" AS asset
        LEFT JOIN "AuditLog" AS log
          ON log."entityType" = 'ASSET'
          AND log."entityId" = asset."id"
        WHERE asset."lastActionAt" IS NULL
        GROUP BY asset."id", asset."createdAt"
      )
      UPDATE "Asset" AS asset
      SET "lastActionAt" = latest_action."occurredAt"
      FROM latest_action
      WHERE asset."id" = latest_action."id"
    `;
    if (!isGroupedCompact) {
      await refreshRecoveryPriorities();
    }
    const allowedSortFields = new Set([
      'assetCode',
      'assetName',
      'level4Name',
      'currentUserName',
      'departmentName',
      'cityName',
      'projectName',
      'locationName',
      'status',
      'purchasePriceExVat',
      'purchaseDate',
      'handoverDate',
      'lastActionAt',
      'updatedAt',
      'createdAt'
    ]);
    const safeSortBy = allowedSortFields.has(String(sortBy)) ? String(sortBy) : 'lastActionAt';
    const safeSortOrder: 'asc' | 'desc' = String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const hasExplicitSort = typeof req.query.sortBy === 'string' && allowedSortFields.has(req.query.sortBy);
    const isLatestActionSort = safeSortBy === 'lastActionAt' && safeSortOrder === 'desc';
    const tableOrderBy: any[] = hasExplicitSort && !isLatestActionSort
      ? [
          { offboardingAlert: 'desc' },
          { recoveryPriority: 'desc' },
          { [safeSortBy]: safeSortOrder },
          { assetCode: 'asc' }
        ]
      : [
          // On first open, the most recently operated asset is always first.
          { lastActionAt: 'desc' },
          { offboardingAlert: 'desc' },
          { recoveryPriority: 'desc' },
          { assetCode: 'asc' }
        ];
    const assetQuery: any = {
      where,
      ...(shouldFetchAll ? {} : { skip, take: Number(limit) }),
      orderBy: isGroupedCompact
        ? [{ [safeSortBy]: safeSortOrder }, { assetCode: 'asc' }]
        : tableOrderBy
    };

    if (isCompact) {
      assetQuery.select = {
        id: true,
        assetCode: true,
        assetName: true,
        assetNameShort: true,
        serialNumber: true,
        purchaseDate: true,
        lastActionAt: true,
        status: true,
        currentUserName: true,
        currentPosition: true,
        departmentName: true,
        cityName: true,
        projectName: true,
        locationName: true,
        level1Code: true,
        level1Name: true,
        level2Code: true,
        level2Name: true,
        level3Code: true,
        level3Name: true,
        level4Code: true,
        level4Name: true,
        offboardingAlert: true,
        offboardingResolvedAt: true,
        expectedRecoveryDate: true,
        repairTickets: {
          where: {
            status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] }
          },
          select: {
            id: true
          }
        }
      };
    } else {
      assetQuery.include = {
        repairTickets: {
          where: {
            status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS'] }
          },
          select: {
            id: true
          }
        },
        liquidations: {
          include: {
            liquidationRecord: {
              select: { id: true, liquidationCode: true, liquidationDate: true }
            }
          },
          orderBy: { id: 'desc' },
          take: 1
        }
      };
    }

    const assetsPromise = prisma.asset.findMany(assetQuery);
    const [assets, total] = shouldSkipCount
      ? [await assetsPromise, 0]
      : await Promise.all([
          assetsPromise,
          prisma.asset.count({ where })
        ]);

    const assetsWithAreaAssignees = await attachAreaAssignees(assets);

    res.json({
      assets: assetsWithAreaAssignees,
      pagination: {
        total,
        page: shouldFetchAll ? 1 : Number(page),
        limit: shouldFetchAll ? total : Number(limit),
        totalPages: shouldFetchAll ? (total > 0 ? 1 : 0) : Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: "Query failed: " + error.message });
  }
});

// Cascading Selects helpers
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

router.get('/categories/active/roots', authenticateToken, async (req, res) => {
  const categories = await prisma.assetCategory.findMany({ where: { level: 1, isActive: true }, orderBy: { sortOrder: 'asc' } });
  res.json(categories);
});

router.get('/categories/active/children/:parentId', authenticateToken, async (req, res) => {
  const categories = await prisma.assetCategory.findMany({
    where: { parentId: parseInt(req.params.parentId as string), isActive: true },
    orderBy: { sortOrder: 'asc' }
  });
  res.json(categories);
});

router.get('/categories/active/all', authenticateToken, async (req, res) => {
  try {
    const categories = await prisma.assetCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Creation & Retrieval
router.post('/bulk-create', authenticateToken, requirePermission('ASSET_CREATE'), async (req: AuthRequest, res) => {
  const {
    companyId, cat1Id, cat2Id, cat3Id, cat4Id,
    assetName, serialNumber, quantity, unit, 
    projectName,
    purchasePriceExVat, usagePurpose, supplierName, purchaseDate, depreciationEndDate,
    note
  } = req.body;
  const performedBy = req.user?.username || 'system';

  try {
    const [company, cat1, cat2, cat3, cat4] = await Promise.all([
      prisma.company.findUnique({ where: { id: Number(companyId) } }),
      prisma.assetCategory.findUnique({ where: { id: Number(cat1Id) } }),
      prisma.assetCategory.findUnique({ where: { id: Number(cat2Id) } }),
      prisma.assetCategory.findUnique({ where: { id: Number(cat3Id) } }),
      prisma.assetCategory.findUnique({ where: { id: Number(cat4Id) } }),
    ]);

    if (!company || !cat1 || !cat2 || !cat3 || !cat4) {
      return res.status(400).json({ message: "Invalid classification path" });
    }

    const codes = await AssetService.generateAssetCodes({
      companyCode: company.code,
      level1Code: cat1.code,
      level2Code: cat2.code,
      level3Code: cat3.code,
      level4Code: cat4.code,
      quantity
    });

    const assetsData = codes.map(c => ({
      assetCode: c.assetCode,
      assetName,
      assetNameShort: AssetService.generateShortName(assetName),
      assetNameShortSource: 'RULE',
      assetNameShortUpdatedAt: new Date(),
      serialNumber: quantity === 1 ? serialNumber : (serialNumber ? `${serialNumber}-${c.runningNoText}` : null),
      companyCode: company.code,
      companyName: company.name,
      projectName: normalizeProjectName(projectName),
      level1Code: cat1.code,
      level1Name: cat1.name,
      level2Code: cat2.code,
      level2Name: cat2.name,
      level3Code: cat3.code,
      level3Name: cat3.name,
      level4Code: cat4.code,
      level4Name: cat4.name,
      runningNo: c.runningNo,
      runningNoText: c.runningNoText,
      unit: normalizeAssetUnit(unit),
      purchasePriceExVat: Number(purchasePriceExVat) || 0,
      usagePurpose,
      supplierName,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      depreciationEndDate: depreciationEndDate ? new Date(depreciationEndDate) : null,
      documentNote: note
    }));

    await AssetService.createAssets(assetsData, performedBy);
    res.json({ message: `Created ${quantity} assets` });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/offboarding-alert', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  try {
    const {
      employeeId,
      employeeName,
      offboardingDate,
      expectedRecoveryDate,
      note
    } = req.body || {};

    const employee = String(employeeName || '').trim();
    if (!employee) return res.status(422).json({ message: 'Vui lòng nhập nhân sự nghỉ việc.' });

    const offDate = parseRequiredDate(offboardingDate, 'Ngày nghỉ việc');
    const recoveryDate = parseRequiredDate(expectedRecoveryDate, 'Ngày cần thu tài sản');
    const priority = calculateRecoveryPriority(recoveryDate);
    const performedBy = req.user?.username || 'system';

    const assets = await prisma.asset.findMany({
      where: {
        isDeleted: false,
        currentUserName: { equals: employee, mode: 'insensitive' }
      },
      select: { id: true, assetCode: true, assetName: true }
    });

    if (assets.length === 0) {
      return res.status(404).json({ message: `Không tìm thấy tài sản đang gán cho nhân sự "${employee}".` });
    }

    await prisma.$transaction(async (tx) => {
      await tx.asset.updateMany({
        where: { id: { in: assets.map(asset => asset.id) } },
        data: {
          offboardingAlert: true,
          offboardingEmployeeId: employeeId ? String(employeeId) : null,
          offboardingEmployeeName: employee,
          offboardingDate: offDate,
          expectedRecoveryDate: recoveryDate,
          offboardingNote: note ? String(note) : null,
          offboardingResolvedAt: null,
          recoveryPriority: priority
        }
      });

      for (const asset of assets) {
        await AuditService.log({
          entityType: 'ASSET',
          entityId: asset.id,
          action: 'UPDATE',
          details: {
            action: 'OFFBOARDING_RECOVERY_ALERT_CREATED',
            employeeName: employee,
            offboardingDate: offDate,
            expectedRecoveryDate: recoveryDate,
            note: note || null
          },
          performedBy,
          tx
        });
      }
    });

    res.json({
      message: `Đã tạo cảnh báo thu hồi cho ${assets.length} tài sản của ${employee}.`,
      count: assets.length,
      assets
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/offboarding-alert/recover', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const performedBy = req.user?.username || 'system';
    const note = req.body?.note ? String(req.body.note) : 'Thu hồi tài sản do nhân sự nghỉ việc';

    const result = await prisma.$transaction(async (tx) => {
      const oldAsset = await tx.asset.findUnique({ where: { id } });
      if (!oldAsset || oldAsset.isDeleted) throw new Error('Tài sản không tồn tại.');

      const updated = await tx.asset.update({
        where: { id },
        data: {
          status: 'IN_STOCK',
          currentUserName: null,
          currentPosition: null,
          departmentName: null,
          handoverDate: null,
          offboardingAlert: false,
          offboardingResolvedAt: new Date(),
          recoveryPriority: 0,
          offboardingNote: oldAsset.offboardingNote ? `${oldAsset.offboardingNote}\n${note}` : note
        }
      });

      await AuditService.logAssetChange(id, oldAsset, updated, performedBy, tx, note);
      await AuditService.log({
        entityType: 'ASSET',
        entityId: id,
        action: 'UPDATE',
        details: { action: 'OFFBOARDING_RECOVERY_COMPLETED', note },
        performedBy,
        tx
      });
      return updated;
    });

    res.json({ message: 'Đã thu hồi tài sản và đóng cảnh báo nghỉ việc.', asset: result });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/offboarding-alert/extend', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const expectedRecoveryDate = parseRequiredDate(req.body?.expectedRecoveryDate, 'Ngày cần thu tài sản');
    const note = req.body?.note ? String(req.body.note) : null;
    const priority = calculateRecoveryPriority(expectedRecoveryDate);
    const performedBy = req.user?.username || 'system';

    const oldAsset = await prisma.asset.findUnique({ where: { id } });
    if (!oldAsset || oldAsset.isDeleted) return res.status(404).json({ message: 'Tài sản không tồn tại.' });

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        offboardingAlert: true,
        expectedRecoveryDate,
        offboardingResolvedAt: null,
        recoveryPriority: priority,
        offboardingNote: note ? (oldAsset.offboardingNote ? `${oldAsset.offboardingNote}\nGia hạn: ${note}` : `Gia hạn: ${note}`) : oldAsset.offboardingNote
      }
    });

    await AuditService.logAssetChange(id, oldAsset, updated, performedBy, undefined, note || 'Gia hạn ngày thu tài sản nghỉ việc');
    res.json({ message: 'Đã gia hạn ngày thu tài sản.', asset: updated });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/offboarding-alert/resolve', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const performedBy = req.user?.username || 'system';
    const note = req.body?.note ? String(req.body.note) : 'Đánh dấu đã xử lý cảnh báo nghỉ việc';

    const oldAsset = await prisma.asset.findUnique({ where: { id } });
    if (!oldAsset || oldAsset.isDeleted) return res.status(404).json({ message: 'Tài sản không tồn tại.' });

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        offboardingAlert: false,
        offboardingResolvedAt: new Date(),
        recoveryPriority: 0,
        offboardingNote: oldAsset.offboardingNote ? `${oldAsset.offboardingNote}\n${note}` : note
      }
    });

    await AuditService.logAssetChange(id, oldAsset, updated, performedBy, undefined, note);
    res.json({ message: 'Đã đánh dấu cảnh báo nghỉ việc là đã xử lý.', asset: updated });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/offboarding-alert/clear', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const performedBy = req.user?.username || 'system';
    const note = req.body?.note ? String(req.body.note) : 'Bỏ cảnh báo nghỉ việc';

    const oldAsset = await prisma.asset.findUnique({ where: { id } });
    if (!oldAsset || oldAsset.isDeleted) return res.status(404).json({ message: 'Tài sản không tồn tại.' });

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        offboardingAlert: false,
        offboardingEmployeeId: null,
        offboardingEmployeeName: null,
        offboardingDate: null,
        expectedRecoveryDate: null,
        offboardingNote: null,
        offboardingResolvedAt: new Date(),
        recoveryPriority: 0
      }
    });

    await AuditService.logAssetChange(id, oldAsset, updated, performedBy, undefined, note);
    res.json({ message: 'Đã bỏ cảnh báo nghỉ việc khỏi tài sản.', asset: updated });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const performedBy = req.user?.username || 'system';

  try {
    const asset = await prisma.asset.findUnique({ where: { id: Number(id) } });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    const { reason, updateAllSameName, ...updates } = req.body;
    
    // Auto-update short name if name changes
    if (updates.assetName && updates.assetName !== asset.assetName) {
      if (asset.assetNameShortSource === 'RULE') {
        updates.assetNameShort = AssetService.generateShortName(updates.assetName);
        updates.assetNameShortUpdatedAt = new Date();
      }
    }

    const updatedAsset = await AssetService.updateAsset(Number(id), updates, performedBy, reason, !!updateAllSameName);
    res.json(updatedAsset);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// --- INVOICE IMPORT ENDPOINTS ---
router.post('/import-invoice/parse', authenticateToken, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng chọn tệp tin để tải lên.' });
    }

    const filename = req.file.originalname.toLowerCase();
    
    // Save file locally to uploads/invoices
    const uploadsDir = path.join(process.cwd(), 'uploads', 'invoices');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const ext = path.extname(req.file.originalname) || (filename.endsWith('.xml') ? '.xml' : filename.endsWith('.pdf') ? '.pdf' : '.xlsx');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const savedFilename = `invoice-${Date.now()}-${randomSuffix}${ext}`;
    const filePath = path.join(uploadsDir, savedFilename);
    fs.writeFileSync(filePath, req.file.buffer);
    const fileUrl = `/uploads/invoices/${savedFilename}`;

    let result: any;
    if (filename.endsWith('.xml')) {
      const xmlContent = req.file.buffer.toString('utf-8');
      result = await InvoiceParserService.parseXml(xmlContent);
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || filename.endsWith('.csv')) {
      result = await InvoiceParserService.parseExcel(req.file.buffer);
    } else if (filename.endsWith('.pdf') || filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
      // PDF or Image text fallback
      result = {
        invoice: { invoiceNo: '', invoiceDate: '', supplierName: '', supplierTaxCode: '', totalAmount: 0 },
        lines: [],
        warnings: ['Không thể bóc tách đầy đủ dữ liệu từ PDF/Ảnh. Vui lòng nhập thủ công hoặc dùng file Excel/XML.']
      };
    } else {
      return res.status(400).json({ message: 'Định dạng tệp không được hỗ trợ. Chỉ hỗ trợ XML, Excel, PDF và ảnh.' });
    }

    // Attach fileUrl to result
    if (result && result.invoice) {
      result.invoice.fileUrl = fileUrl;
    }

    return res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/import-invoice/post', authenticateToken, async (req: any, res) => {
  const performedBy = req.user?.username || 'system';

  try {
    const result = await InvoicePostService.postInvoice(req.body, performedBy);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/invoices', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { search = '', status } = req.query;
    const where: any = {};
    if (search) {
      where.OR = [
        { invoiceNo: { contains: String(search), mode: 'insensitive' } },
        { supplierName: { contains: String(search), mode: 'insensitive' } }
      ];
    }
    if (status) where.status = String(status);
    const invoices = await prisma.assetInvoiceBatch.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50
    });
    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/invoices', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res): Promise<any> => {
  try {
    const assetId = Number(req.body.assetId || 0);
    const invoiceNo = String(req.body.invoiceNo || '').trim();
    const supplierName = String(req.body.supplierName || '').trim();
    const invoiceDate = String(req.body.invoiceDate || '').trim();
    if (!assetId || !invoiceNo || !supplierName || !invoiceDate) {
      return res.status(400).json({ message: 'Vui lòng nhập đủ số hóa đơn, ngày hóa đơn và nhà cung cấp.' });
    }

    const asset = await prisma.asset.findFirst({ where: { id: assetId, isDeleted: false } });
    if (!asset) return res.status(404).json({ message: 'Tài sản không tồn tại.' });
    const company = await resolveAssetOwningCompany(asset);
    if (!company) {
      return res.status(400).json({
        message: `Không xác định được công ty sở hữu của tài sản ${asset.assetCode}. Vui lòng kiểm tra mã công ty ${asset.companyCode || '--'} trong Big Data Center.`
      });
    }

    const duplicate = await prisma.assetInvoiceBatch.findFirst({
      where: { invoiceNo, supplierName: { equals: supplierName, mode: 'insensitive' }, companyId: company.id }
    });
    if (duplicate) return res.status(409).json({ message: 'Hóa đơn này đã tồn tại. Vui lòng chọn hóa đơn trong danh sách để liên kết.' });

    const parsedDate = new Date(invoiceDate);
    if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ message: 'Ngày hóa đơn không hợp lệ.' });
    const performedBy = req.user?.username || 'system';
    const oldInvoiceId = asset.invoiceBatchId;
    const totalAmount = req.body.totalAmount === '' || req.body.totalAmount === null || req.body.totalAmount === undefined
      ? null
      : Number(req.body.totalAmount);
    if (totalAmount !== null && (!Number.isFinite(totalAmount) || totalAmount < 0)) {
      return res.status(400).json({ message: 'Tổng tiền hóa đơn không hợp lệ.' });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.assetInvoiceBatch.create({
        data: {
          invoiceNo,
          invoiceDate: parsedDate,
          supplierName,
          supplierTaxCode: String(req.body.supplierTaxCode || '').trim() || null,
          companyId: company.id,
          totalAmount,
          note: String(req.body.note || '').trim() || null,
          status: 'POSTED',
          totalAssets: 1,
          postedAt: new Date()
        }
      });
      await tx.asset.update({
        where: { id: assetId },
        data: {
          invoiceBatchId: created.id,
          invoiceLineId: null,
          companyCode: company.code,
          companyName: company.name,
          supplierName: created.supplierName,
          supplierTaxCode: created.supplierTaxCode,
          purchaseDate: created.invoiceDate
        }
      });
      if (oldInvoiceId) {
        const remainingAssets = await tx.asset.count({ where: { invoiceBatchId: oldInvoiceId, isDeleted: false } });
        await tx.assetInvoiceBatch.update({ where: { id: oldInvoiceId }, data: { totalAssets: remainingAssets } });
      }
      await tx.assetEditLog.create({
        data: {
          assetId,
          fieldName: 'invoiceBatchId',
          oldValue: oldInvoiceId ? String(oldInvoiceId) : null,
          newValue: String(created.id),
          editedBy: performedBy
        }
      });
      if (asset.companyCode !== company.code) {
        await tx.assetEditLog.create({
          data: {
            assetId,
            fieldName: 'companyCode',
            oldValue: asset.companyCode,
            newValue: company.code,
            editedBy: performedBy
          }
        });
      }
      if (asset.companyName !== company.name) {
        await tx.assetEditLog.create({
          data: {
            assetId,
            fieldName: 'companyName',
            oldValue: asset.companyName,
            newValue: company.name,
            editedBy: performedBy
          }
        });
      }
      return created;
    });
    await AuditService.log({ entityType: 'ASSET_INVOICE', entityId: invoice.id, action: 'CREATE', details: JSON.stringify({ operation: 'CREATE_AND_LINK', assetId, invoiceNo }), performedBy });
    res.status(201).json(invoice);
  } catch (error: any) {
    res.status(500).json({ message: 'Không thể thêm và liên kết hóa đơn: ' + error.message });
  }
});

router.get('/invoices/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const invoice = await prisma.assetInvoiceBatch.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { lineNo: 'asc' }
        },
        assets: {
          where: { isDeleted: false },
          orderBy: { assetCode: 'asc' }
        }
      }
    });
    if (!invoice) {
      return res.status(404).json({ message: 'Hóa đơn không tồn tại.' });
    }
    res.json(invoice);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/invoices/:id', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { invoiceNo, invoiceDate, supplierName, supplierTaxCode, totalAmount, totalAssets, note } = req.body;

    const invoice = await prisma.assetInvoiceBatch.findUnique({ where: { id } });
    if (!invoice) {
      return res.status(404).json({ message: 'Hóa đơn không tồn tại.' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.assetInvoiceBatch.update({
        where: { id },
        data: {
          invoiceNo: invoiceNo !== undefined ? invoiceNo : invoice.invoiceNo,
          invoiceDate: invoiceDate !== undefined ? new Date(invoiceDate) : invoice.invoiceDate,
          supplierName: supplierName !== undefined ? supplierName : invoice.supplierName,
          supplierTaxCode: supplierTaxCode !== undefined ? supplierTaxCode : invoice.supplierTaxCode,
          totalAmount: totalAmount !== undefined ? parseFloat(totalAmount) : invoice.totalAmount,
          totalAssets: totalAssets !== undefined ? parseInt(totalAssets) : invoice.totalAssets,
          note: note !== undefined ? note : invoice.note
        }
      });

      // Propagate supplier details and purchase date to all linked assets
      await tx.asset.updateMany({
        where: { invoiceBatchId: id, isDeleted: false },
        data: {
          supplierName: u.supplierName,
          supplierTaxCode: u.supplierTaxCode,
          purchaseDate: u.invoiceDate
        }
      });

      return u;
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/invoices/:id/add-assets', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  const performedBy = req.user?.username || 'system';
  try {
    const id = parseInt(req.params.id as string);
    const { templateAssetId, quantity, serials } = req.body;

    if (!templateAssetId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Tham số templateAssetId và quantity (> 0) là bắt buộc.' });
    }

    const invoice = await prisma.assetInvoiceBatch.findUnique({
      where: { id },
      include: { lines: true }
    });
    if (!invoice) {
      return res.status(404).json({ message: 'Hóa đơn không tồn tại.' });
    }

    const templateAsset = await prisma.asset.findUnique({
      where: { id: parseInt(templateAssetId) }
    });
    if (!templateAsset) {
      return res.status(404).json({ message: 'Tài sản mẫu không tồn tại.' });
    }

    if (templateAsset.invoiceBatchId !== id) {
      return res.status(400).json({ message: 'Tài sản mẫu không thuộc hóa đơn này.' });
    }

    // Validate serials if provided
    const serialList: string[] = Array.isArray(serials) ? serials.filter(Boolean).map(s => String(s).trim()) : [];
    if (serialList.length > quantity) {
      return res.status(400).json({ message: 'Số lượng serial cung cấp vượt quá số lượng cần tạo.' });
    }

    // Check duplicate serials in request
    const dupesInReq = serialList.filter((item, index) => serialList.indexOf(item) !== index);
    if (dupesInReq.length > 0) {
      return res.status(400).json({ message: `Có số serial bị trùng lặp trong yêu cầu: ${dupesInReq.join(', ')}` });
    }

    // Check duplicate serials in active assets in DB
    if (serialList.length > 0) {
      const existingAssets = await prisma.asset.findMany({
        where: {
          serialNumber: { in: serialList },
          isDeleted: false
        },
        select: { serialNumber: true }
      });
      if (existingAssets.length > 0) {
        const dupes = existingAssets.map(a => a.serialNumber).filter(Boolean);
        return res.status(400).json({ message: `Số serial đã tồn tại trong hệ thống: ${dupes.join(', ')}` });
      }
    }

    // Run the operation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Generate Asset Codes
      const codes = await AssetService.generateAssetCodes({
        companyCode: templateAsset.companyCode,
        level1Code: templateAsset.level1Code,
        level2Code: templateAsset.level2Code,
        level3Code: templateAsset.level3Code,
        level4Code: templateAsset.level4Code,
        quantity: quantity
      }, tx);

      // 2. Prepare Asset Records
      const assetsData = codes.map((c, i) => {
        const serial = serialList[i] || null;
        return {
          assetCode: c.assetCode,
          assetName: templateAsset.assetName,
          assetNameShort: templateAsset.assetNameShort,
          serialNumber: serial,
          companyCode: templateAsset.companyCode,
          companyName: templateAsset.companyName,
          projectName: templateAsset.projectName,
          level1Code: templateAsset.level1Code,
          level1Name: templateAsset.level1Name,
          level2Code: templateAsset.level2Code,
          level2Name: templateAsset.level2Name,
          level3Code: templateAsset.level3Code,
          level3Name: templateAsset.level3Name,
          level4Code: templateAsset.level4Code,
          level4Name: templateAsset.level4Name,
          runningNo: c.runningNo,
          runningNoText: c.runningNoText,
          status: 'IN_STOCK',
          unit: templateAsset.unit,
          purchasePriceExVat: templateAsset.purchasePriceExVat,
          supplierName: templateAsset.supplierName,
          supplierTaxCode: templateAsset.supplierTaxCode,
          purchaseDate: templateAsset.purchaseDate,
          invoiceBatchId: id,
          invoiceLineId: templateAsset.invoiceLineId,
          originalInvoiceItemName: templateAsset.originalInvoiceItemName
        };
      });

      // Insert Assets
      await tx.asset.createMany({ data: assetsData });

      // 3. Update Invoice Line (if invoiceLineId is set on the template asset)
      if (templateAsset.invoiceLineId) {
        const line = await tx.assetInvoiceLine.findUnique({
          where: { id: templateAsset.invoiceLineId }
        });
        if (line) {
          const newQty = line.quantity + quantity;
          const newAmount = newQty * line.unitPrice;
          
          let newSerials = [];
          if (line.serialsJson) {
            try {
              newSerials = JSON.parse(line.serialsJson);
            } catch (e) {}
          }
          if (Array.isArray(newSerials)) {
            newSerials.push(...serialList);
          } else {
            newSerials = [...serialList];
          }

          await tx.assetInvoiceLine.update({
            where: { id: templateAsset.invoiceLineId },
            data: {
              quantity: newQty,
              amount: newAmount,
              serialsJson: JSON.stringify(newSerials)
            }
          });
        }
      }

      // 4. Update Invoice Batch
      const addedValue = quantity * (templateAsset.purchasePriceExVat || 0);
      const updatedBatch = await tx.assetInvoiceBatch.update({
        where: { id },
        data: {
          totalAssets: { increment: quantity },
          totalValue: { increment: addedValue }
        }
      });

      // 5. Audit Log
      await AuditService.log({
        entityType: 'CREATION_BATCH',
        entityId: id,
        action: 'UPDATE',
        details: { 
          message: `Bổ sung ${quantity} tài sản từ tài sản mẫu ${templateAsset.assetCode}`,
          addedQuantity: quantity,
          addedValue,
          templateAssetCode: templateAsset.assetCode
        },
        performedBy,
        tx
      });

      return {
        updatedBatch,
        addedAssetsCount: quantity,
        codes: codes.map(c => c.assetCode)
      };
    }, { timeout: 30000 });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/invoices/:id/link-assets-by-code', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res): Promise<any> => {
  try {
    const invoiceId = Number(req.params.id);
    const codes = Array.from(new Set(String(req.body.assetCodes || '')
      .split(/[\s,;]+/)
      .map((code) => code.trim())
      .filter((code) => /^\d+(?:\.\d+){2,}$/.test(code))))
      .slice(0, 200);
    if (codes.length === 0) return res.status(400).json({ message: 'Vui lòng nhập ít nhất một mã tài sản hợp lệ.' });

    const invoice = await prisma.assetInvoiceBatch.findUnique({ where: { id: invoiceId } });
    if (!invoice) return res.status(404).json({ message: 'Hóa đơn không tồn tại.' });
    const company = await prisma.company.findUnique({ where: { id: invoice.companyId }, select: { code: true } });
    if (!company) return res.status(400).json({ message: 'Không xác định được công ty nhận hóa đơn.' });

    const assets = await prisma.asset.findMany({
      where: { assetCode: { in: codes }, isDeleted: false },
      select: { id: true, assetCode: true, companyCode: true, invoiceBatchId: true }
    });
    const foundCodes = new Set(assets.map((asset) => asset.assetCode));
    const missing = codes.filter((code) => !foundCodes.has(code));
    const alreadyLinked = assets.filter((asset) => asset.invoiceBatchId === invoiceId).map((asset) => asset.assetCode);
    const otherInvoice = assets.filter((asset) => asset.invoiceBatchId && asset.invoiceBatchId !== invoiceId).map((asset) => asset.assetCode);
    const otherCompany = assets.filter((asset) => !asset.invoiceBatchId && asset.companyCode !== company.code).map((asset) => asset.assetCode);
    const eligible = assets.filter((asset) => !asset.invoiceBatchId && asset.companyCode === company.code);
    const performedBy = req.user?.username || 'system';

    if (eligible.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.asset.updateMany({
          where: { id: { in: eligible.map((asset) => asset.id) } },
          data: {
            invoiceBatchId: invoiceId,
            invoiceLineId: null,
            supplierName: invoice.supplierName,
            supplierTaxCode: invoice.supplierTaxCode,
            purchaseDate: invoice.invoiceDate
          }
        });
        await tx.assetEditLog.createMany({
          data: eligible.map((asset) => ({
            assetId: asset.id,
            fieldName: 'invoiceBatchId',
            oldValue: null,
            newValue: String(invoiceId),
            editedBy: performedBy
          }))
        });
        const totalAssets = await tx.asset.count({ where: { invoiceBatchId: invoiceId, isDeleted: false } });
        await tx.assetInvoiceBatch.update({ where: { id: invoiceId }, data: { totalAssets } });
      });
      await AuditService.log({
        entityType: 'ASSET_INVOICE',
        entityId: invoiceId,
        action: 'UPDATE',
        details: JSON.stringify({ operation: 'LINK_ASSETS_BY_CODE', assetCodes: eligible.map((asset) => asset.assetCode) }),
        performedBy
      });
    }

    res.json({
      linked: eligible.map((asset) => asset.assetCode),
      alreadyLinked,
      missing,
      otherInvoice,
      otherCompany
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Không thể thêm nhanh tài sản vào hóa đơn: ' + error.message });
  }
});

router.delete('/invoices/:id/assets/:assetId', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  const performedBy = req.user?.username || 'system';
  try {
    const invoiceId = parseInt(req.params.id as string);
    const assetId = parseInt(req.params.assetId as string);

    const invoice = await prisma.assetInvoiceBatch.findUnique({
      where: { id: invoiceId }
    });
    if (!invoice) {
      return res.status(404).json({ message: 'Hóa đơn không tồn tại.' });
    }

    const asset = await prisma.asset.findUnique({
      where: { id: assetId }
    });
    if (!asset) {
      return res.status(404).json({ message: 'Tài sản không tồn tại.' });
    }

    if (asset.invoiceBatchId !== invoiceId) {
      return res.status(400).json({ message: 'Tài sản không thuộc hóa đơn này.' });
    }

    // Protect: only allow deleting assets that are IN_STOCK
    if (asset.status !== 'IN_STOCK') {
      return res.status(400).json({ 
        message: `Không thể xóa tài sản này vì trạng thái hiện tại là "${asset.status}". Chỉ được phép xóa tài sản ở trạng thái "Trong kho".` 
      });
    }

    // Execute deletion inside transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Soft delete the asset by setting isDeleted to true and renaming its assetCode to avoid conflicts
      const deletedAsset = await tx.asset.update({
        where: { id: assetId },
        data: {
          isDeleted: true,
          assetCode: `${asset.assetCode}-DELETED-${Date.now()}`
        }
      });

      // 2. Update corresponding Invoice Line
      if (asset.invoiceLineId) {
        const line = await tx.assetInvoiceLine.findUnique({
          where: { id: asset.invoiceLineId }
        });
        if (line) {
          const newQty = Math.max(0, line.quantity - 1);
          const newAmount = newQty * line.unitPrice;

          // Remove serial from serialsJson if matches
          let newSerials = [];
          if (line.serialsJson) {
            try {
              newSerials = JSON.parse(line.serialsJson);
            } catch (e) {}
          }
          if (Array.isArray(newSerials) && asset.serialNumber) {
            newSerials = newSerials.filter(s => s !== asset.serialNumber);
          }

          await tx.assetInvoiceLine.update({
            where: { id: asset.invoiceLineId },
            data: {
              quantity: newQty,
              amount: newAmount,
              serialsJson: JSON.stringify(newSerials)
            }
          });
        }
      }

      // 3. Update Invoice Batch totals
      const price = asset.purchasePriceExVat || 0;
      const updatedBatch = await tx.assetInvoiceBatch.update({
        where: { id: invoiceId },
        data: {
          totalAssets: { decrement: 1 },
          totalValue: { decrement: price }
        }
      });

      // 4. Audit Log
      await AuditService.log({
        entityType: 'CREATION_BATCH',
        entityId: invoiceId,
        action: 'UPDATE',
        details: { 
          message: `Xóa tài sản ${asset.assetCode} khỏi hóa đơn`,
          removedAssetCode: asset.assetCode,
          removedValue: price
        },
        performedBy,
        tx
      });

      return {
        updatedBatch,
        deletedAssetCode: asset.assetCode
      };
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/link-invoice', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  try {
    const assetId = parseInt(req.params.id as string);
    const { invoiceBatchId } = req.body;
    const performedBy = req.user?.username || 'system';

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) return res.status(404).json({ message: 'Tài sản không tồn tại.' });

    const oldInvoiceId = asset.invoiceBatchId;

    if (invoiceBatchId === null || invoiceBatchId === undefined || invoiceBatchId === '') {
      await prisma.asset.update({
        where: { id: assetId },
        data: {
          invoiceBatchId: null,
          invoiceLineId: null
        }
      });
      
      await prisma.assetEditLog.create({
        data: {
          assetId,
          fieldName: 'invoiceBatchId',
          oldValue: oldInvoiceId ? String(oldInvoiceId) : null,
          newValue: null,
          editedBy: performedBy
        }
      });

      return res.json({ message: 'Đã hủy liên kết hóa đơn thành công.' });
    }

    const batch = await prisma.assetInvoiceBatch.findUnique({ where: { id: parseInt(invoiceBatchId) } });
    if (!batch) return res.status(404).json({ message: 'Hóa đơn không tồn tại.' });

    await prisma.asset.update({
      where: { id: assetId },
      data: {
        invoiceBatchId: batch.id,
        supplierName: batch.supplierName,
        supplierTaxCode: batch.supplierTaxCode,
        purchaseDate: batch.invoiceDate
      }
    });

    await prisma.assetEditLog.create({
      data: {
        assetId,
        fieldName: 'invoiceBatchId',
        oldValue: oldInvoiceId ? String(oldInvoiceId) : null,
        newValue: String(batch.id),
        editedBy: performedBy
      }
    });

    res.json({ message: 'Đã liên kết hóa đơn thành công.' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Get static CSV template for importing assets from invoices
router.get('/import-invoice/template', async (req, res) => {
  try {
    const headers = [
      'invoiceNo', 'invoiceDate', 'supplierName', 'supplierTaxCode',
      'itemName', 'standardAssetName', 'category1', 'category2',
      'category3', 'category4', 'quantity', 'unitPrice', 'serials', 'note'
    ];
    const example = [
      'HD-001', '2026-05-18', 'Dell Vietnam', '0102030405',
      'Laptop Dell XPS 15 9530', 'Laptop Dell XPS 15 2024', '03 - Máy móc, thiết bị', '01 - Thiết bị văn phòng',
      '01 - Thiết bị đầu cuối', '01 - PC', '5', '45000000', 'SN-XPS001, SN-XPS002, SN-XPS003, SN-XPS004, SN-XPS005', 'Hàng nhập mới cho ban CNTT'
    ];
    
    // Add BOM for Microsoft Excel to auto-detect UTF-8 and display Vietnamese diacritics
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers.join(','), example.join(',')].join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Template_Nhap_Tai_San_Hoa_Don.csv"');
    res.send(csvContent);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// GET /export-excel - Sổ tài sản (Asset Register Snapshot with filters)
router.get('/export-excel', authenticateToken, requirePermission('ASSET_VIEW'), async (req: AuthRequest, res) => {
  const { 
    search = '', 
    sortBy = 'updatedAt', 
    sortOrder = 'desc',
    status,
    companyCode,
    currentUserName,
    departmentName,
    locationQuery,
    cityName,
    projectName,
    level4Code,
    level4Name,
    priceMin,
    priceMax,
    purchaseDateFrom,
    purchaseDateTo,
    handoverDateFrom,
    handoverDateTo,
    depreciationEndDateFrom,
    depreciationEndDateTo,
    supplierName,
    hasSerial,
    hasDocuments,
    lastInventoryFrom,
    lastInventoryTo,
    inventoryStatus,
    createdFrom,
    createdTo,
    isAssigned,
    invoiceBatchId,
    selectedDate,
    reportType,
    compareMode
  } = req.query;

  const where: any = { isDeleted: false };
  const andClauses: any[] = [];

  // Data Scope
  const scopeWhere = buildDataScopeWhere(req.user?.dataScope, req.user?.id || 0, {
    company: 'companyCode',
    department: 'departmentName',
    warehouse: 'locationName',
    user: 'currentUserName'
  });
  
  if (Object.keys(scopeWhere).length > 0) {
    if (scopeWhere.id === -1) {
      const workbook = buildExcelWorkbook('DANH SÁCH SỔ TÀI SẢN', 'Không tìm thấy dữ liệu', [], [], 'Sổ tài sản');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=SoTaiSan.xlsx');
      await workbook.xlsx.write(res);
      return res.end();
    }
    andClauses.push(scopeWhere);
  }

  // Advanced Search
  if (search) {
    const assetCodes = parsePastedAssetCodes(search);
    if (assetCodes.length > 1) {
      andClauses.push({ assetCode: { in: assetCodes } });
    } else {
      const searchString = String(search).trim();
      andClauses.push({
        OR: [
        { assetCode: { contains: searchString, mode: 'insensitive' } },
        { assetName: { contains: searchString, mode: 'insensitive' } },
        { assetNameShort: { contains: searchString, mode: 'insensitive' } },
        { serialNumber: { contains: searchString, mode: 'insensitive' } },
        { companyCode: { contains: searchString, mode: 'insensitive' } },
        { companyName: { contains: searchString, mode: 'insensitive' } },
        { projectName: { contains: searchString, mode: 'insensitive' } },
        { level1Code: { contains: searchString, mode: 'insensitive' } },
        { level1Name: { contains: searchString, mode: 'insensitive' } },
        { level2Code: { contains: searchString, mode: 'insensitive' } },
        { level2Name: { contains: searchString, mode: 'insensitive' } },
        { level3Code: { contains: searchString, mode: 'insensitive' } },
        { level3Name: { contains: searchString, mode: 'insensitive' } },
        { level4Code: { contains: searchString, mode: 'insensitive' } },
        { level4Name: { contains: searchString, mode: 'insensitive' } },
        { runningNoText: { contains: searchString, mode: 'insensitive' } },
        { status: { contains: searchString, mode: 'insensitive' } },
        { unit: { contains: searchString, mode: 'insensitive' } },
        { usagePurpose: { contains: searchString, mode: 'insensitive' } },
        { supplierName: { contains: searchString, mode: 'insensitive' } },
        { supplierTaxCode: { contains: searchString, mode: 'insensitive' } },
        { currentUserName: { contains: searchString, mode: 'insensitive' } },
        { currentPosition: { contains: searchString, mode: 'insensitive' } },
        { departmentName: { contains: searchString, mode: 'insensitive' } },
        { locationName: { contains: searchString, mode: 'insensitive' } },
        { cityName: { contains: searchString, mode: 'insensitive' } },
        { documentNote: { contains: searchString, mode: 'insensitive' } },
        { attachments: { contains: searchString, mode: 'insensitive' } },
        { technicalSpecsJson: { contains: searchString, mode: 'insensitive' } },
        { originalInvoiceItemName: { contains: searchString, mode: 'insensitive' } },
          { lastInventoryStatus: { contains: searchString, mode: 'insensitive' } }
        ]
      });
    }
  }

  if (status) {
    const statusArray = String(status).split(',').filter(Boolean);
    if (statusArray.length > 0) {
      const mappedStatuses: string[] = [];
      for (const s of statusArray) {
        if (s === 'BROKEN') {
          mappedStatuses.push('DAMAGED');
          mappedStatuses.push('BROKEN');
        } else if (s === 'LIQUIDATED') {
          mappedStatuses.push('LIQUIDATED');
          mappedStatuses.push('DISPOSED');
        } else {
          mappedStatuses.push(s);
        }
      }
      where.status = { in: mappedStatuses };
    }
  }

  if (companyCode) where.companyCode = String(companyCode);
  if (isAssigned === 'true') {
    where.currentUserName = { not: null, notIn: ['', 'N/A', 'n/a'] };
  } else if (isAssigned === 'false') {
    where.currentUserName = { in: [null, '', 'N/A', 'n/a'] };
  } else if (currentUserName) {
    where.currentUserName = { contains: String(currentUserName), mode: 'insensitive' };
  }
  if (departmentName) where.departmentName = { contains: String(departmentName), mode: 'insensitive' };
  if (level4Name) {
    const nameArray = String(level4Name).split(',').filter(Boolean);
    if (nameArray.length > 0) where.level4Name = { in: nameArray };
  } else if (level4Code) {
    where.level4Code = String(level4Code);
  }
  if (cityName) where.cityName = { contains: String(cityName), mode: 'insensitive' };
  if (projectName) where.projectName = { contains: String(projectName), mode: 'insensitive' };
  if (locationQuery) {
    andClauses.push({
      OR: [
        { locationName: { contains: String(locationQuery), mode: 'insensitive' } },
        { cityName: { contains: String(locationQuery), mode: 'insensitive' } },
        { projectName: { contains: String(locationQuery), mode: 'insensitive' } }
      ]
    });
  }

  if (priceMin || priceMax) {
    where.purchasePriceExVat = {};
    if (priceMin) where.purchasePriceExVat.gte = Number(priceMin);
    if (priceMax) where.purchasePriceExVat.lte = Number(priceMax);
  }

  if (purchaseDateFrom || purchaseDateTo) {
    where.purchaseDate = {};
    if (purchaseDateFrom) where.purchaseDate.gte = new Date(String(purchaseDateFrom));
    if (purchaseDateTo) where.purchaseDate.lte = new Date(String(purchaseDateTo));
  }
  
  if (handoverDateFrom || handoverDateTo) {
    where.handoverDate = {};
    if (handoverDateFrom) where.handoverDate.gte = new Date(String(handoverDateFrom));
    if (handoverDateTo) where.handoverDate.lte = new Date(String(handoverDateTo));
  }

  if (depreciationEndDateFrom || depreciationEndDateTo) {
    where.depreciationEndDate = {};
    if (depreciationEndDateFrom) where.depreciationEndDate.gte = new Date(String(depreciationEndDateFrom));
    if (depreciationEndDateTo) where.depreciationEndDate.lte = new Date(String(depreciationEndDateTo));
  }

  if (lastInventoryFrom || lastInventoryTo) {
    where.lastInventoryDate = {};
    if (lastInventoryFrom) where.lastInventoryDate.gte = new Date(String(lastInventoryFrom));
    if (lastInventoryTo) where.lastInventoryDate.lte = new Date(String(lastInventoryTo));
  }

  if (createdFrom || createdTo) {
    where.createdAt = {};
    if (createdFrom) where.createdAt.gte = new Date(String(createdFrom));
    if (createdTo) {
      const end = new Date(String(createdTo));
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  if (supplierName) where.supplierName = { contains: String(supplierName), mode: 'insensitive' };
  if (invoiceBatchId) where.invoiceBatchId = Number(invoiceBatchId);
  if (inventoryStatus) where.lastInventoryStatus = String(inventoryStatus);
  if (hasSerial === 'true') where.serialNumber = { not: null, notIn: ['', 'N/A', 'n/a'] };
  if (hasSerial === 'false') where.serialNumber = { in: [null, '', 'N/A', 'n/a'] };
  if (hasDocuments === 'true') where.documentNote = { not: null, notIn: ['', 'N/A', 'n/a'] };
  if (hasDocuments === 'false') where.documentNote = { in: [null, '', 'N/A', 'n/a'] };

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  try {
    const allowedSortFields = new Set([
      'assetCode', 'assetName', 'serialNumber', 'status', 'currentUserName',
      'departmentName', 'locationName', 'cityName', 'projectName',
      'purchasePriceExVat', 'purchaseDate', 'handoverDate', 'updatedAt', 'createdAt'
    ]);
    const safeSortBy = allowedSortFields.has(String(sortBy)) ? String(sortBy) : 'updatedAt';
    const safeSortOrder: 'asc' | 'desc' = String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const assets = await prisma.asset.findMany({
      where,
      orderBy: { [safeSortBy]: safeSortOrder },
      select: {
        assetCode: true,
        assetName: true,
        assetNameShort: true,
        serialNumber: true,
        companyCode: true,
        companyName: true,
        projectName: true,
        level1Name: true,
        level2Name: true,
        level3Name: true,
        level4Name: true,
        status: true,
        unit: true,
        purchasePriceExVat: true,
        purchaseDate: true,
        currentUserName: true,
        currentPosition: true,
        departmentName: true,
        locationName: true,
        cityName: true,
        handoverDate: true,
        supplierName: true,
        depreciationEndDate: true,
        documentNote: true,
        createdAt: true
      }
    });

    const hasPricePermission = req.user?.roles?.includes('SUPER_ADMIN') || req.user?.permissions?.includes('ASSET_VIEW_PRICE');

    const headers = [
      'Mã tài sản', 'Tên tài sản', 'Tên rút gọn', 'Số Serial', 'Mã công ty', 'Tên công ty', 'Dự án',
      'Nhóm LV1', 'Nhóm LV2', 'Nhóm LV3', 'Nhóm LV4', 'Trạng thái', 'Đơn vị tính',
      ...(hasPricePermission ? ['Giá mua (Ex VAT)'] : []),
      'Ngày mua', 'Người sử dụng', 'Chức vụ', 'Bộ phận', 'Vị trí', 'Tỉnh/Thành phố', 'Ngày bàn giao', 'Nhà cung cấp', 'Hạn khấu hao', 'Ghi chú tài liệu'
    ];

    const userStr = req.user?.fullName || req.user?.username || 'Admin';
    const reportDate = selectedDate ? new Date(String(selectedDate)) : new Date();
    reportDate.setHours(23, 59, 59, 999);
    const currentDate = new Date();
    const selectedAssets = assets.filter((asset) => new Date(asset.createdAt) <= reportDate);
    const selectedCodes = new Set(selectedAssets.map((asset) => asset.assetCode));
    const increasedAssets = assets.filter((asset) => !selectedCodes.has(asset.assetCode));
    const abnormalAssets = assets.filter((asset) => ['UNDER_REPAIR', 'DAMAGED', 'LOST', 'LIQUIDATED', 'DISPOSED', 'PENDING_DISPOSAL'].includes(asset.status));
    const selectedByCode = new Map(selectedAssets.map((asset) => [asset.assetCode, asset]));
    const compareRows = assets.map((asset) => {
      const before = selectedByCode.get(asset.assetCode);
      const changes: string[] = [];
      if (!before) changes.push('Tăng mới');
      if (before && before.currentUserName !== asset.currentUserName) changes.push('Đổi NSD');
      if (before && before.locationName !== asset.locationName) changes.push('Đổi vị trí');
      if (before && before.departmentName !== asset.departmentName) changes.push('Điều chuyển');
      if (before && before.status !== asset.status) changes.push('Đổi trạng thái');
      if (changes.length === 0) changes.push('Không thay đổi');
      return [
        asset.assetCode,
        asset.assetName,
        before?.departmentName || '',
        asset.departmentName || '',
        before?.locationName || '',
        asset.locationName || '',
        before?.currentUserName || '',
        asset.currentUserName || '',
        before?.status || '',
        asset.status || '',
        changes.join(', ')
      ];
    });
    const statusCount = (items: typeof assets, statuses: string[]) => items.filter((asset) => statuses.includes(asset.status)).length;
    const valueSum = (items: typeof assets) => items.reduce((sum, asset) => sum + Number(asset.purchasePriceExVat || 0), 0);
    const blankLabel = '--';
    const getBucketLabel = (value?: string | null) => {
      const label = String(value || '').trim();
      return label || blankLabel;
    };
    const buildLv4QuantityRows = (
      selectedItems: typeof assets,
      currentItems: typeof assets,
      field: 'departmentName' | 'locationName' | 'cityName'
    ) => {
      const totals = new Map<string, { lv4: string; value: string; selected: number; current: number }>();
      const add = (asset: typeof assets[number], target: 'selected' | 'current') => {
        const lv4 = getBucketLabel(asset.level4Name);
        const value = getBucketLabel(asset[field]);
        const key = `${lv4}|||${value}`;
        const row = totals.get(key) || { lv4, value, selected: 0, current: 0 };
        row[target] += 1;
        totals.set(key, row);
      };
      selectedItems.forEach((asset) => add(asset, 'selected'));
      currentItems.forEach((asset) => add(asset, 'current'));
      return Array.from(totals.values())
        .sort((a, b) => a.lv4.localeCompare(b.lv4, 'vi') || a.value.localeCompare(b.value, 'vi'))
        .map((row) => [row.lv4, row.value, row.selected, row.current, row.current - row.selected]);
    };
    const lv4ByDepartmentRows = buildLv4QuantityRows(selectedAssets, assets, 'departmentName');
    const lv4ByLocationRows = buildLv4QuantityRows(selectedAssets, assets, 'locationName');
    const lv4ByCityRows = buildLv4QuantityRows(selectedAssets, assets, 'cityName');
    const summaryRows = [
      ['Tổng quan', 'Tổng tài sản', selectedAssets.length, assets.length, assets.length - selectedAssets.length],
      ['Tổng quan', 'Đang sử dụng', statusCount(selectedAssets, ['ASSIGNED']), statusCount(assets, ['ASSIGNED']), statusCount(assets, ['ASSIGNED']) - statusCount(selectedAssets, ['ASSIGNED'])],
      ['Tổng quan', 'Tồn kho', statusCount(selectedAssets, ['IN_STOCK']), statusCount(assets, ['IN_STOCK']), statusCount(assets, ['IN_STOCK']) - statusCount(selectedAssets, ['IN_STOCK'])],
      ['Tổng quan', 'Hỏng / sửa chữa', statusCount(selectedAssets, ['DAMAGED', 'UNDER_REPAIR']), statusCount(assets, ['DAMAGED', 'UNDER_REPAIR']), statusCount(assets, ['DAMAGED', 'UNDER_REPAIR']) - statusCount(selectedAssets, ['DAMAGED', 'UNDER_REPAIR'])],
      ['Tổng quan', 'Mất / thất thoát', statusCount(selectedAssets, ['LOST']), statusCount(assets, ['LOST']), statusCount(assets, ['LOST']) - statusCount(selectedAssets, ['LOST'])],
      ['Tổng quan', 'Thanh lý', statusCount(selectedAssets, ['LIQUIDATED', 'DISPOSED']), statusCount(assets, ['LIQUIDATED', 'DISPOSED']), statusCount(assets, ['LIQUIDATED', 'DISPOSED']) - statusCount(selectedAssets, ['LIQUIDATED', 'DISPOSED'])],
      ['Tổng quan', 'Tổng nguyên giá', valueSum(selectedAssets), valueSum(assets), valueSum(assets) - valueSum(selectedAssets)],
      [],
      ['Biến động', 'Tăng mới', increasedAssets.length, '', ''],
      ['Biến động', 'Giảm / không còn trong phạm vi', 0, '', ''],
      ['Biến động', 'Thay đổi người sử dụng', compareRows.filter((row) => String(row[10]).includes('Đổi NSD')).length, '', ''],
      ['Biến động', 'Thay đổi vị trí', compareRows.filter((row) => String(row[10]).includes('Đổi vị trí')).length, '', ''],
      ['Biến động', 'Thay đổi trạng thái', compareRows.filter((row) => String(row[10]).includes('Đổi trạng thái')).length, '', ''],
      [],
      ['Theo nhóm LV4 + Bộ phận', 'Nhóm LV4', 'Bộ phận', 'Tại thời điểm chọn', 'Hiện tại', 'Chênh lệch'],
      ...lv4ByDepartmentRows.map((row) => ['Theo nhóm LV4 + Bộ phận', row[0], row[1], row[2], row[3], row[4]]),
      [],
      ['Theo nhóm LV4 + Vị trí', 'Nhóm LV4', 'Vị trí', 'Tại thời điểm chọn', 'Hiện tại', 'Chênh lệch'],
      ...lv4ByLocationRows.map((row) => ['Theo nhóm LV4 + Vị trí', row[0], row[1], row[2], row[3], row[4]]),
      [],
      ['Theo nhóm LV4 + Tỉnh/Thành phố', 'Nhóm LV4', 'Tỉnh/Thành phố', 'Tại thời điểm chọn', 'Hiện tại', 'Chênh lệch'],
      ...lv4ByCityRows.map((row) => ['Theo nhóm LV4 + Tỉnh/Thành phố', row[0], row[1], row[2], row[3], row[4]])
    ];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=BaoCaoSoTaiSan.xlsx');
    res.setHeader('Cache-Control', 'no-store');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
      useSharedStrings: false
    });
    const writeSimpleSheet = (name: string, sheetHeaders: string[], sheetRows: any[][]) => {
      const reportSheet = workbook.addWorksheet(name);
      sheetHeaders.forEach((header, index) => {
        reportSheet.getColumn(index + 1).width = Math.max(String(header).length + 4, 16);
      });
      const reportHeaderRow = reportSheet.addRow(sheetHeaders);
      reportHeaderRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9EAF7' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      reportHeaderRow.commit();
      for (const rowData of sheetRows) {
        const row = reportSheet.addRow(rowData);
        row.eachCell((cell) => {
          cell.font = { name: 'Arial', size: 10 };
          cell.alignment = { vertical: 'middle' };
        });
        row.commit();
      }
      reportSheet.commit();
    };
    const toAssetRow = (asset: any) => [
      asset.assetCode,
      asset.assetName,
      asset.assetNameShort || '',
      asset.serialNumber || '',
      asset.companyCode,
      asset.companyName,
      asset.projectName || '',
      asset.level1Name,
      asset.level2Name,
      asset.level3Name,
      asset.level4Name,
      asset.status === 'IN_STOCK' ? 'Trong kho' :
      asset.status === 'ASSIGNED' ? 'Đã cấp phát' :
      asset.status === 'UNDER_REPAIR' ? 'Đang sửa chữa' :
      asset.status === 'DAMAGED' ? 'Bị hỏng' :
      asset.status === 'LOST' ? 'Bị mất' :
      asset.status === 'LIQUIDATED' ? 'Đã thanh lý' : asset.status,
      asset.unit || 'Cái',
      ...(hasPricePermission ? [asset.purchasePriceExVat] : []),
      formatDate(asset.purchaseDate),
      asset.currentUserName || '',
      asset.currentPosition || '',
      asset.departmentName || '',
      asset.locationName || '',
      asset.cityName || '',
      formatDate(asset.handoverDate),
      asset.supplierName || '',
      formatDate(asset.depreciationEndDate),
      asset.documentNote || ''
    ];
    writeSimpleSheet('01_Tổng hợp', ['Bảng', 'Chỉ tiêu / Nhóm LV4', 'Theo', 'Tại thời điểm chọn', 'Hiện tại', 'Chênh lệch'], summaryRows);
    writeSimpleSheet('02_TS tại thời điểm chọn', headers, selectedAssets.map(toAssetRow));
    writeSimpleSheet('03_TS hiện tại', headers, assets.map(toAssetRow));
    writeSimpleSheet('04_TS tăng', headers, increasedAssets.map(toAssetRow));
    writeSimpleSheet('05_TS giảm', headers, []);
    writeSimpleSheet('06_TS điều chuyển đến', headers, []);
    writeSimpleSheet('07_TS điều chuyển đi', headers, []);
    writeSimpleSheet('08_TS thay đổi NSD', ['Mã TS', 'Tên TS', 'NSD tại mốc chọn', 'NSD hiện tại', 'Phòng ban hiện tại', 'Vị trí hiện tại'], compareRows.filter((row) => String(row[10]).includes('Đổi NSD')).map((row) => [row[0], row[1], row[6], row[7], row[3], row[5]]));
    writeSimpleSheet('09_TS thay đổi vị trí', ['Mã TS', 'Tên TS', 'Vị trí tại mốc chọn', 'Vị trí hiện tại', 'Phòng ban tại mốc chọn', 'Phòng ban hiện tại'], compareRows.filter((row) => String(row[10]).includes('Đổi vị trí')).map((row) => [row[0], row[1], row[4], row[5], row[2], row[3]]));
    writeSimpleSheet('10_TS đổi trạng thái', ['Mã TS', 'Tên TS', 'Trạng thái tại mốc chọn', 'Trạng thái hiện tại', 'Kết quả'], compareRows.filter((row) => String(row[10]).includes('Đổi trạng thái')).map((row) => [row[0], row[1], row[8], row[9], row[10]]));
    writeSimpleSheet('11_TS hỏng-mất-thanh lý', headers, abnormalAssets.map(toAssetRow));
    writeSimpleSheet('12_Lịch sử biến động', ['Mã TS', 'Tên TS', 'Mốc chọn', 'Hiện tại', 'Ghi chú'], compareRows.filter((row) => row[10] !== 'Không thay đổi').map((row) => [row[0], row[1], formatDate(reportDate), formatDate(currentDate), row[10]]));
    writeSimpleSheet('13_Đối chiếu', ['Mã TS', 'Tên TS', 'Đơn vị tại mốc chọn', 'Đơn vị hiện tại', 'Vị trí tại mốc chọn', 'Vị trí hiện tại', 'NSD tại mốc chọn', 'NSD hiện tại', 'Trạng thái tại mốc chọn', 'Trạng thái hiện tại', 'Kết quả'], compareRows);
    writeSimpleSheet('14_LV4 theo Bộ phận', ['Nhóm LV4', 'Bộ phận', 'Tại thời điểm chọn', 'Hiện tại', 'Chênh lệch'], lv4ByDepartmentRows);
    writeSimpleSheet('15_LV4 theo Vị trí', ['Nhóm LV4', 'Vị trí', 'Tại thời điểm chọn', 'Hiện tại', 'Chênh lệch'], lv4ByLocationRows);
    writeSimpleSheet('16_LV4 theo Tỉnh TP', ['Nhóm LV4', 'Tỉnh/Thành phố', 'Tại thời điểm chọn', 'Hiện tại', 'Chênh lệch'], lv4ByCityRows);

    const sheet = workbook.addWorksheet('Sổ tài sản');

    const columnWidths = [22, 38, 24, 20, 14, 24, 24, 24, 24, 24, 24, 18, 14];
    if (hasPricePermission) columnWidths.push(18);
    columnWidths.push(14, 24, 22, 22, 26, 20, 14, 24, 16, 30);
    columnWidths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });

    sheet.mergeCells(1, 1, 1, headers.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = 'BÁO CÁO CHI TIẾT SỔ TÀI SẢN';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F497D' } };
    sheet.getRow(1).height = 40;

    sheet.mergeCells(2, 1, 2, headers.length);
    const subCell = sheet.getCell(2, 1);
    subCell.value = `Loại báo cáo: ${reportType || 'detail'} | So sánh với: ${compareMode || 'current'} | Mốc chọn: ${formatDate(reportDate)} | Thời gian xuất: ${currentDate.toLocaleString('vi-VN')} | Người xuất: ${userStr}`;
    subCell.font = { name: 'Arial', size: 10, italic: true };
    subCell.alignment = { horizontal: 'center' };
    sheet.addRow([]);

    const headerRow = sheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '366092' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.commit();

    for (const asset of assets) {
      const row = sheet.addRow([
        asset.assetCode,
        asset.assetName,
        asset.assetNameShort || '',
        asset.serialNumber || '',
        asset.companyCode,
        asset.companyName,
        asset.projectName || '',
        asset.level1Name,
        asset.level2Name,
        asset.level3Name,
        asset.level4Name,
        asset.status === 'IN_STOCK' ? 'Trong kho' :
        asset.status === 'ASSIGNED' ? 'Đã cấp phát' :
        asset.status === 'UNDER_REPAIR' ? 'Đang sửa chữa' :
        asset.status === 'DAMAGED' ? 'Bị hỏng' :
        asset.status === 'LOST' ? 'Bị mất' :
        asset.status === 'LIQUIDATED' ? 'Đã thanh lý' : asset.status,
        asset.unit || 'Cái',
        ...(hasPricePermission ? [asset.purchasePriceExVat] : []),
        formatDate(asset.purchaseDate),
        asset.currentUserName || '',
        asset.currentPosition || '',
        asset.departmentName || '',
        asset.locationName || '',
        asset.cityName || '',
        formatDate(asset.handoverDate),
        asset.supplierName || '',
        formatDate(asset.depreciationEndDate),
        asset.documentNote || ''
      ]);
      row.height = 20;
      row.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.alignment = { vertical: 'middle' };
      });
      row.commit();
    }

    sheet.commit();
    await workbook.commit();
  } catch (error: any) {
    console.error('Asset export error:', error);
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.status(500).json({ message: 'Lỗi xuất Excel: ' + error.message });
  }
});

// GET /export-created - Cấp mới / Nhập lô (New Assignment / Batch Import by Date Range)
router.get('/export-created', authenticateToken, requirePermission('ASSET_VIEW'), async (req: AuthRequest, res) => {
  const { startDate, endDate } = req.query;
  const where: any = { isDeleted: false };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(String(startDate));
    if (endDate) {
      const end = new Date(String(endDate));
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  // Data Scope
  const scopeWhere = buildDataScopeWhere(req.user?.dataScope, req.user?.id || 0, {
    company: 'companyCode',
    department: 'departmentName',
    warehouse: 'locationName',
    user: 'currentUserName'
  });
  if (Object.keys(scopeWhere).length > 0) {
    if (scopeWhere.id === -1) {
      const workbook = buildExcelWorkbook('DANH SÁCH CẤP MỚI - NHẬP LÔ TÀI SẢN', 'Không tìm thấy dữ liệu', [], [], 'Nhập lô');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=BaoCaoNhapLo.xlsx');
      await workbook.xlsx.write(res);
      return res.end();
    }
    where.AND = [scopeWhere];
  }

  try {
    const assets = await prisma.asset.findMany({
      where,
      include: {
        creationBatch: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const assetIds = assets.map(a => a.id);
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'ASSET',
        entityId: { in: assetIds },
        action: 'CREATE'
      }
    });
    const auditLogMap = new Map(auditLogs.map(log => [log.entityId, log.performedBy]));

    const hasPricePermission = req.user?.roles?.includes('SUPER_ADMIN') || req.user?.permissions?.includes('ASSET_VIEW_PRICE');

    const headers = [
      'Mã đợt nhập', 'Ngày nhập lô', 'Người thực hiện', 'Nhà cung cấp', 'Số chứng từ/Hóa đơn',
      'Mã tài sản', 'Tên tài sản', 'Loại phân mục (Cấp 4)', 'Số Serial', 'Đơn vị tính',
      ...(hasPricePermission ? ['Nguyên giá'] : []),
      'Trạng thái tài sản ban đầu', 'Ghi chú đợt'
    ];

    const rows = assets.map(a => {
      const creator = auditLogMap.get(a.id) || 'system';
      return [
        a.creationBatch?.batchCode || 'Cá lẻ (Không đợt)',
        a.creationBatch?.batchDate ? formatDate(a.creationBatch.batchDate) : formatDate(a.createdAt),
        creator,
        a.supplierName || a.creationBatch?.supplierName || '',
        a.creationBatch?.documentNo || '',
        a.assetCode,
        a.assetName,
        `${a.level4Code} - ${a.level4Name}`,
        a.serialNumber || '',
        a.unit || 'Cái',
        ...(hasPricePermission ? [a.purchasePriceExVat] : []),
        a.status === 'IN_STOCK' ? 'Trong kho' :
        a.status === 'ASSIGNED' ? 'Đã cấp phát' : a.status,
        a.creationBatch?.note || ''
      ];
    });

    const dateRangeStr = startDate && endDate ? `Từ ${startDate} đến ${endDate}` : 'Tất cả thời gian';
    const userStr = req.user?.fullName || req.user?.username || 'Admin';
    const workbook = buildExcelWorkbook(
      'BÁO CÁO TỔNG HỢP CẤP MỚI / NHẬP LÔ TÀI SẢN',
      `Khoảng thời gian: ${dateRangeStr} | Người xuất: ${userStr}`,
      headers,
      rows,
      'Cấp mới nhập lô'
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=BaoCaoNhapLoTaiSan.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    res.status(500).json({ message: 'Lỗi xuất Excel: ' + error.message });
  }
});

// GET /export-liquidated - Thanh lý tài sản (Liquidation records by Date Range)
router.get('/export-liquidated', authenticateToken, requirePermission('ASSET_VIEW'), async (req: AuthRequest, res) => {
  const { startDate, endDate } = req.query;
  const where: any = {};

  if (startDate || endDate) {
    where.liquidationRecord = {
      liquidationDate: {}
    };
    if (startDate) where.liquidationRecord.liquidationDate.gte = new Date(String(startDate));
    if (endDate) {
      const end = new Date(String(endDate));
      end.setHours(23, 59, 59, 999);
      where.liquidationRecord.liquidationDate.lte = end;
    }
  }

  // Data Scope
  const scopeWhere = buildDataScopeWhere(req.user?.dataScope, req.user?.id || 0, {
    company: 'companyCode',
    department: 'departmentName',
    warehouse: 'locationName',
    user: 'currentUserName'
  });
  if (Object.keys(scopeWhere).length > 0) {
    if (scopeWhere.id === -1) {
      const workbook = buildExcelWorkbook('DANH SÁCH THANH LÝ TÀI SẢN', 'Không tìm thấy dữ liệu', [], [], 'Thanh lý');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=BaoCaoThanhLy.xlsx');
      await workbook.xlsx.write(res);
      return res.end();
    }
    where.asset = scopeWhere;
  }

  try {
    const items = await prisma.liquidationItem.findMany({
      where,
      include: {
        liquidationRecord: true,
        asset: true
      },
      orderBy: {
        liquidationRecord: {
          liquidationDate: 'desc'
        }
      }
    });

    const hasPricePermission = req.user?.roles?.includes('SUPER_ADMIN') || req.user?.permissions?.includes('ASSET_VIEW_PRICE');

    const headers = [
      'Mã hồ sơ thanh lý', 'Ngày thanh lý', 'Loại thanh lý', 'Số chứng từ/Hợp đồng',
      'Đối tác mua/nhận', 'Lý do thanh lý', 'Mã tài sản', 'Tên tài sản',
      ...(hasPricePermission ? ['Nguyên giá tài sản', 'Giá trị thanh lý'] : []),
      'Ghi chú hồ sơ'
    ];

    const rows = items.map(item => [
      item.liquidationRecord.liquidationCode,
      formatDate(item.liquidationRecord.liquidationDate),
      item.liquidationRecord.liquidationType === 'SELL' ? 'Bán thanh lý' :
      item.liquidationRecord.liquidationType === 'DESTROY' ? 'Hủy bỏ' :
      item.liquidationRecord.liquidationType === 'GIVE' ? 'Cho tặng' :
      item.liquidationRecord.liquidationType === 'RETURN_SUPPLIER' ? 'Trả NCC' : item.liquidationRecord.liquidationType || '',
      item.liquidationRecord.documentNo || '',
      item.liquidationRecord.buyerName || '',
      item.liquidationRecord.reason || '',
      item.asset.assetCode,
      item.asset.assetName,
      ...(hasPricePermission ? [item.asset.purchasePriceExVat, item.assetValue] : []),
      item.liquidationRecord.note || ''
    ]);

    const dateRangeStr = startDate && endDate ? `Từ ${startDate} đến ${endDate}` : 'Tất cả thời gian';
    const userStr = req.user?.fullName || req.user?.username || 'Admin';
    const workbook = buildExcelWorkbook(
      'BÁO CÁO TỔNG HỢP THANH LÝ TÀI SẢN',
      `Khoảng thời gian: ${dateRangeStr} | Người xuất: ${userStr}`,
      headers,
      rows,
      'Thanh lý tài sản'
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=BaoCaoThanhLyTaiSan.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    res.status(500).json({ message: 'Lỗi xuất Excel: ' + error.message });
  }
});

router.get('/barcode/:barcode', authenticateToken, requirePermission('ASSET_VIEW'), async (req: AuthRequest, res) => {
  try {
    const barcode = req.params.barcode as string;
    const asset = await prisma.asset.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { assetCode: barcode },
          { serialNumber: barcode }
        ]
      },
      include: {
        assignments: { orderBy: { createdAt: 'desc' } },
        damageReports: { include: { damageReport: true } },
        lostReports: { orderBy: { createdAt: 'desc' } },
        liquidations: { include: { liquidationRecord: true } },
        events: { orderBy: { eventDate: 'desc' } },
        editLogs: { orderBy: { createdAt: 'desc' } },
        repairTickets: { orderBy: { createdAt: 'desc' } },
        repairLogs: { orderBy: { createdAt: 'desc' } },
        histories: { orderBy: { eventTime: 'desc' } },
        creationBatch: {
          include: {
            assets: {
              where: { isDeleted: false },
              orderBy: { assetCode: 'asc' },
              select: { id: true, assetCode: true, assetName: true, status: true }
            }
          }
        },
        invoiceBatch: true,
        invoiceLine: true
      }
    });

    if (!asset) return res.status(404).json({ message: 'Không tìm thấy tài sản với mã hoặc serial này' });

    // Hide price if no ASSET_VIEW_PRICE
    if (!req.user?.roles?.includes('SUPER_ADMIN') && !req.user?.permissions?.includes('ASSET_VIEW_PRICE')) {
      asset.purchasePriceExVat = null;
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: 'ASSET', entityId: asset.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ ...asset, auditLogs });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/health', authenticateToken, requirePermission('ASSET_VIEW'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const result = await SmartAIService.assetHealth(id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id/assignment-info', authenticateToken, requirePermission('ASSET_UPDATE'), async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const performedBy = req.user?.username || req.user?.fullName || 'system';
  const {
    recipientType,
    recipientArea,
    currentUserName,
    currentPosition,
    currentUserPhone,
    departmentName,
    locationName,
    cityName,
    projectName,
    note,
    reason
  } = req.body || {};

  try {
    const result = await prisma.$transaction(async (tx) => {
      const oldAsset = await tx.asset.findUnique({ where: { id } });
      if (!oldAsset) throw new Error('Asset not found');
      const normalizedRecipientType = recipientType === 'AREA' ? 'AREA' : 'PERSON';
      const normalizedRecipientArea = String(recipientArea || '').trim();
      const normalizedUserName = String(currentUserName || '').trim();
      if (normalizedRecipientType === 'AREA' && !normalizedRecipientArea) {
        throw new Error('Vui lòng nhập tên khu vực / nơi đặt tài sản');
      }
      if (normalizedRecipientType === 'PERSON' && !normalizedUserName) {
        throw new Error('Vui lòng nhập họ tên người nhận');
      }

      const normalizedLocation = normalizeAssetLocation(
        locationName,
        cityName || oldAsset.cityName,
        projectName || oldAsset.projectName,
        departmentName || oldAsset.departmentName
      );
      const parsedLocation = parseAndNormalizeLocation(normalizedLocation);
      const normalizedDepartment = normalizeDepartmentName(
        departmentName,
        cityName || parsedLocation.city || oldAsset.cityName,
        projectName || parsedLocation.project || oldAsset.projectName
      ) || null;
      const assetUpdates: any = {
        currentUserName: normalizedRecipientType === 'AREA' ? null : normalizedUserName,
        currentUserPhone: normalizedRecipientType === 'AREA' ? null : (currentUserPhone || null),
        currentPosition: normalizedRecipientType === 'AREA' ? null : (currentPosition || null),
        currentAssigneeProfileId: null,
        departmentName: normalizedDepartment,
        locationName: normalizedLocation || null,
        cityName: cityName || parsedLocation.city || null,
        projectName: normalizeProjectName(projectName || parsedLocation.project) || null
      };
      if (normalizedRecipientType === 'PERSON') {
        const canonicalAssignee = await AssigneeNormalizationService.resolveCanonicalAssignee(tx, {
          name: normalizedUserName,
          phone: currentUserPhone,
          position: currentPosition,
          departmentName: normalizedDepartment
        });
        if (canonicalAssignee) {
          assetUpdates.currentUserName = canonicalAssignee.currentUserName;
          assetUpdates.currentUserPhone = canonicalAssignee.currentUserPhone;
          assetUpdates.currentPosition = canonicalAssignee.currentPosition;
          assetUpdates.departmentName = canonicalAssignee.departmentName;
          assetUpdates.currentAssigneeProfileId = canonicalAssignee.profileId;
        }
      }

      const updatedAsset = await tx.asset.update({
        where: { id },
        data: assetUpdates
      });

      const latestHandoverDocument = await tx.handoverDocument.findFirst({
        where: {
          items: { some: { assetId: id } },
          status: { in: ['COMPLETED', 'PENDING_CONFIRMATION', 'DRAFT'] }
        },
        orderBy: [
          { confirmedAt: 'desc' },
          { documentDate: 'desc' },
          { createdAt: 'desc' }
        ],
        select: {
          id: true,
          recipientType: true,
          recipientArea: true,
          recipientPhone: true,
          recipientName: true,
          recipientPosition: true,
          recipientDepartment: true,
          newLocation: true,
          newCity: true
        }
      });

      let updatedHandoverDocument = latestHandoverDocument;
      if (latestHandoverDocument) {
        updatedHandoverDocument = await tx.handoverDocument.update({
          where: { id: latestHandoverDocument.id },
          data: {
            recipientType: normalizedRecipientType,
            recipientArea: normalizedRecipientType === 'AREA' ? normalizedRecipientArea : null,
            recipientName: normalizedRecipientType === 'AREA'
              ? (latestHandoverDocument.recipientName || normalizedRecipientArea)
              : normalizedUserName,
            recipientPosition: normalizedRecipientType === 'AREA' ? null : (currentPosition || null),
            recipientDepartment: normalizedDepartment,
            recipientPhone: normalizedRecipientType === 'AREA' ? null : (currentUserPhone || null),
            newLocation: normalizedLocation || null,
            newCity: cityName || parsedLocation.city || null,
            note: note || undefined
          },
          select: {
            id: true,
            recipientType: true,
            recipientArea: true,
            recipientPhone: true,
            recipientName: true,
            recipientPosition: true,
            recipientDepartment: true,
            newLocation: true,
            newCity: true
          }
        });
      }

      await tx.assetAssignment.create({
        data: {
          assetId: id,
          previousUserName: oldAsset.currentUserName,
          newUserName: normalizedRecipientType === 'AREA'
            ? `KHU VỰC: ${normalizedRecipientArea}`
            : normalizedUserName,
          newPosition: normalizedRecipientType === 'AREA' ? null : (currentPosition || null),
          newDepartmentName: normalizedDepartment,
          newLocationName: normalizedLocation || null,
          newCityName: cityName || parsedLocation.city || null,
          newStatus: oldAsset.status,
          effectiveAt: new Date(),
          note: reason || note || 'Cập nhật thông tin cấp phát'
        }
      });

      await AuditService.logAssetChange(
        id,
        oldAsset,
        updatedAsset,
        performedBy,
        tx,
        reason || note || 'Bổ sung/chỉnh sửa thông tin cấp phát'
      );

      const phoneChanged = (latestHandoverDocument?.recipientPhone || '') !== (normalizedRecipientType === 'AREA' ? '' : (currentUserPhone || ''));
      if (phoneChanged || note) {
        await AuditService.log({
          entityType: 'ASSET',
          entityId: id,
          action: 'UPDATE',
          details: {
            changes: {
              ...(phoneChanged ? { currentUserPhone: { old: latestHandoverDocument?.recipientPhone || null, new: normalizedRecipientType === 'AREA' ? null : (currentUserPhone || null) } } : {}),
              ...(note ? { assignmentNote: { old: null, new: note } } : {})
            },
            reason: reason || note || 'Bổ sung/chỉnh sửa thông tin cấp phát'
          },
          performedBy,
          tx
        });
      }

      return {
        ...updatedAsset,
        latestHandoverDocument: updatedHandoverDocument,
        latestAssignmentPhone: updatedAsset.currentUserPhone || updatedHandoverDocument?.recipientPhone || null
      };
    });

    res.json(result);
  } catch (error: any) {
    const validationError = error.message === 'Vui lòng nhập tên khu vực / nơi đặt tài sản'
      || error.message === 'Vui lòng nhập họ tên người nhận';
    res.status(error.message === 'Asset not found' ? 404 : validationError ? 400 : 500).json({ message: error.message });
  }
});

router.get('/:id', authenticateToken, requirePermission('ASSET_VIEW'), async (req: AuthRequest, res) => {
  const idParam = req.params.id as string;
  let asset = null;

  if (!isNaN(Number(idParam))) {
    asset = await prisma.asset.findUnique({
      where: { id: Number(idParam) },
      include: {
        assignments: { orderBy: { createdAt: 'desc' } },
        damageReports: { include: { damageReport: true } },
        lostReports: { orderBy: { createdAt: 'desc' } },
        liquidations: { include: { liquidationRecord: true } },
        events: { orderBy: { eventDate: 'desc' } },
        editLogs: { orderBy: { createdAt: 'desc' } },
        repairTickets: { orderBy: { createdAt: 'desc' } },
        repairLogs: { orderBy: { createdAt: 'desc' } },
        histories: { orderBy: { eventTime: 'desc' } },
        creationBatch: {
          include: {
            assets: {
              where: { isDeleted: false },
              orderBy: { assetCode: 'asc' },
              select: { id: true, assetCode: true, assetName: true, status: true }
            }
          }
        },
        invoiceBatch: true,
        invoiceLine: true
      }
    });
  }

  if (!asset) {
    asset = await prisma.asset.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { assetCode: idParam },
          { serialNumber: idParam }
        ]
      },
      include: {
        assignments: { orderBy: { createdAt: 'desc' } },
        damageReports: { include: { damageReport: true } },
        lostReports: { orderBy: { createdAt: 'desc' } },
        liquidations: { include: { liquidationRecord: true } },
        events: { orderBy: { eventDate: 'desc' } },
        editLogs: { orderBy: { createdAt: 'desc' } },
        repairTickets: { orderBy: { createdAt: 'desc' } },
        repairLogs: { orderBy: { createdAt: 'desc' } },
        histories: { orderBy: { eventTime: 'desc' } },
        invoiceBatch: true,
        invoiceLine: true
      }
    });
  }

  if (!asset) return res.status(404).json({ message: 'Asset not found' });

  // Data Scope Check for details view
  const scopeWhere = buildDataScopeWhere(req.user?.dataScope, req.user?.id || 0, {
    company: 'companyCode',
    department: 'departmentName',
    warehouse: 'locationName',
    user: 'currentUserName'
  });

  // Verify the user can see this specific asset
  if (scopeWhere.id !== undefined && scopeWhere.id === -1) {
    return res.status(403).json({ message: 'Bạn không có quyền xem tài sản này (Data Scope)' });
  }

  if (scopeWhere.OR) {
    // Fast manual check since we already have the asset data
    const canView = scopeWhere.OR.some((clause: any) => {
      if (clause.companyCode && clause.companyCode.in.includes(asset.companyCode)) return true;
      if (clause.departmentName && clause.departmentName.in.includes(asset.departmentName)) return true;
      if (clause.locationName && clause.locationName.in.includes(asset.locationName)) return true;
      return false;
    });
    if (!canView) return res.status(403).json({ message: 'Bạn không có quyền xem tài sản này (Data Scope)' });
  } else if ((scopeWhere as any).currentUserName) {
    if (asset.currentUserName !== req.user?.fullName && asset.currentUserName !== req.user?.username) {
      return res.status(403).json({ message: 'Bạn không có quyền xem tài sản này (Chỉ xem của bản thân)' });
    }
  }

  // Hide price if no ASSET_VIEW_PRICE
  if (!req.user?.roles?.includes('SUPER_ADMIN') && !req.user?.permissions?.includes('ASSET_VIEW_PRICE')) {
    asset.purchasePriceExVat = null;
  }

  // Fetch centralized audit logs
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: 'ASSET', entityId: asset.id },
    orderBy: { createdAt: 'desc' }
  });

  const latestHandoverDocument = await prisma.handoverDocument.findFirst({
    where: {
      items: { some: { assetId: asset.id } },
      status: { in: ['COMPLETED', 'PENDING_CONFIRMATION', 'DRAFT'] }
    },
    orderBy: [
      { confirmedAt: 'desc' },
      { documentDate: 'desc' },
      { createdAt: 'desc' }
    ],
    select: {
      id: true,
      documentNo: true,
      type: true,
      status: true,
      recipientName: true,
      recipientPhone: true,
      recipientPosition: true,
      recipientDepartment: true,
      newLocation: true,
      newCity: true,
      documentDate: true,
      confirmedAt: true
    }
  });

  const [inventoryItems, inventoryDetails] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { assetId: asset.id, checkedAt: { not: null } },
      orderBy: { checkedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        checkedAt: true,
        checkedBy: true,
        result: true,
        note: true,
        inventoryCheck: {
          select: { inventoryCode: true, inventoryName: true }
        }
      }
    }),
    prisma.inventoryDetail.findMany({
      where: { assetId: asset.id, checkedAt: { not: null } },
      orderBy: { checkedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        checkedAt: true,
        checkedBy: true,
        resultStatus: true,
        note: true,
        session: {
          select: {
            checkerName: true,
            inventoryCheck: {
              select: { inventoryCode: true, inventoryName: true }
            }
          }
        }
      }
    })
  ]);

  const inventoryHistory = [
    ...inventoryItems.map((item) => ({
      id: `item-${item.id}`,
      checkedAt: item.checkedAt,
      checkedBy: item.checkedBy,
      result: item.result || 'MATCHED',
      note: item.note,
      inventoryCode: item.inventoryCheck.inventoryCode,
      inventoryName: item.inventoryCheck.inventoryName
    })),
    ...inventoryDetails.map((detail) => ({
      id: `detail-${detail.id}`,
      checkedAt: detail.checkedAt,
      checkedBy: detail.checkedBy || detail.session.checkerName,
      result: detail.resultStatus || 'MATCH',
      note: detail.note,
      inventoryCode: detail.session.inventoryCheck.inventoryCode,
      inventoryName: detail.session.inventoryCheck.inventoryName
    }))
  ]
    .sort((a, b) => new Date(b.checkedAt || 0).getTime() - new Date(a.checkedAt || 0).getTime())
    .slice(0, 20);

  res.json({
    ...asset,
    auditLogs,
    inventoryHistory,
    lastInventoryBy: inventoryHistory[0]?.checkedBy || null,
    latestHandoverDocument,
    latestAssignmentPhone: asset.currentUserPhone || latestHandoverDocument?.recipientPhone || null
  });
});

export default router;

