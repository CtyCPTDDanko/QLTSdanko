import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { OperationalService } from '../services/operational.service';
import prisma from '../utils/prisma';
import { PdfUtil } from '../utils/pdf.util';

const router = Router();

// --- DAMAGE REPORTS ---
router.post('/damage', authenticateToken, async (req: any, res) => {
  try {
    const report = await OperationalService.createDamageReport(req.body, req.user.username);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// --- LOST REPORTS ---
router.post('/lost', authenticateToken, async (req: any, res) => {
  try {
    const report = await OperationalService.createLostReport(req.body, req.user.username);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// --- LIQUIDATION ---
router.post('/liquidation', authenticateToken, async (req: any, res) => {
  try {
    const record = await OperationalService.createLiquidation(req.body, req.user.username);
    res.json(record);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Danh sách thanh lý lấy trực tiếp từ sổ hồ sơ thanh lý, không suy diễn từ
// trạng thái hiện tại của tài sản. Nhờ đó ngày, loại và giá trị luôn khớp sổ sách.
router.get('/liquidation', authenticateToken, async (req: any, res) => {
  try {
    const where: any = {};
    const fromDate = String(req.query.fromDate || '').trim();
    const toDate = String(req.query.toDate || '').trim();
    if (fromDate || toDate) {
      where.liquidationDate = {};
      if (fromDate) where.liquidationDate.gte = new Date(fromDate);
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        where.liquidationDate.lte = endDate;
      }
    }

    const records = await prisma.liquidationRecord.findMany({
      where,
      include: {
        items: {
          include: { asset: { include: { financeProfile: true } } },
          orderBy: { id: 'asc' }
        }
      },
      orderBy: [{ liquidationDate: 'desc' }, { id: 'desc' }]
    });
    res.json({ records });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Không thể tải sổ thanh lý.' });
  }
});

// In biên bản theo tài sản đã thanh lý. Một hồ sơ có thể chứa nhiều tài sản.
router.get('/liquidation/asset/:assetId/pdf', authenticateToken, async (req: any, res) => {
  try {
    const assetId = Number(req.params.assetId);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      return res.status(400).json({ message: 'Mã tài sản không hợp lệ.' });
    }

    const liquidationItem = await prisma.liquidationItem.findFirst({
      where: { assetId },
      orderBy: { id: 'desc' },
      include: {
        liquidationRecord: {
          include: {
            items: {
              include: { asset: { include: { financeProfile: true } } },
              orderBy: { id: 'asc' }
            }
          }
        }
      }
    });
    const record = liquidationItem?.liquidationRecord;
    if (!record) return res.status(404).json({ message: 'Không tìm thấy hồ sơ thanh lý.' });

    const pdfBuffer = await PdfUtil.generateLiquidationPdf(record);
    const safeCode = record.liquidationCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=BBTL_${safeCode}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Không thể tạo biên bản thanh lý.' });
  }
});


// --- PRINT LOG ---
router.get('/print-logs', authenticateToken, async (req: any, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const result = await OperationalService.getPrintLogs(limit);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/print-log', authenticateToken, async (req: any, res) => {
  try {
    const result = await OperationalService.logPrintAction(req.body, req.user.username);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/log-print', authenticateToken, async (req: any, res) => {
  try {
    const result = await OperationalService.logPrintAction(req.body, req.user.username);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
