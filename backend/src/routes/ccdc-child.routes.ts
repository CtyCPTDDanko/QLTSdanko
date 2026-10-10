import { Router } from 'express';
import { CCDCChildService } from '../services/ccdc-child.service';
import multer from 'multer';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

const ccdcRouter = Router();
const childRouter = Router();
const approvalRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.CCDC_CHILD_MAX_UPLOAD_BYTES || 10 * 1024 * 1024) }
});

const actor = (req: any) => req.user?.fullName || req.user?.username || 'system';

ccdcRouter.post('/:parentId/child-items', async (req: any, res) => {
  try {
    const parentId = parseInt(req.params.parentId, 10);
    if (isNaN(parentId)) return res.status(400).json({ message: 'ID CCDC cha không hợp lệ.' });
    const result = await CCDCChildService.createMany(parentId, req.body, actor(req));
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

ccdcRouter.get('/:parentId/child-items', async (req: any, res) => {
  try {
    const parentId = parseInt(req.params.parentId, 10);
    if (isNaN(parentId)) return res.status(400).json({ message: 'ID CCDC cha không hợp lệ.' });
    const result = await CCDCChildService.list(parentId, req.query);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

ccdcRouter.get('/:parentId/child-summary', async (req: any, res) => {
  try {
    const parentId = parseInt(req.params.parentId, 10);
    if (isNaN(parentId)) return res.status(400).json({ message: 'ID CCDC cha không hợp lệ.' });
    const parentSummary = await CCDCChildService.getParentSummary(parentId);
    res.json({ summaryReady: true, parentSummary });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

approvalRouter.get('/', async (req: any, res) => {
  try {
    const result = await CCDCChildService.listApprovalRequests(req.query);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

approvalRouter.post('/:id/approve', async (req: any, res) => {
  try {
    const result = await CCDCChildService.approveRequest(parseInt(req.params.id, 10), actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

approvalRouter.post('/:id/reject', async (req: any, res) => {
  try {
    const result = await CCDCChildService.rejectRequest(parseInt(req.params.id, 10), req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.get('/dashboard/summary', async (req: any, res) => {
  try {
    const result = await CCDCChildService.getDashboard(req.query);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

childRouter.get('/dashboard/alerts', async (req: any, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 3;
    const result = await CCDCChildService.getAlerts(days);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

childRouter.get('/alerts', async (req: any, res) => {
  try {
    await CCDCChildService.generateAlerts(req.query.days ? parseInt(req.query.days, 10) : 3);
    const result = await CCDCChildService.listPersistentAlerts(req.query);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

childRouter.post('/alerts/:id/resolve', async (req: any, res) => {
  try {
    const result = await CCDCChildService.resolveAlert(parseInt(req.params.id, 10), actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/bulk-action', async (req: any, res) => {
  try {
    const result = await CCDCChildService.bulkAction(req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/inventory/batch-scan', async (req: any, res) => {
  try {
    const result = await CCDCChildService.batchScan(req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/inventory/batch-process', async (req: any, res) => {
  try {
    const result = await CCDCChildService.batchProcess(req.body.batchId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/inventory/batch-confirm', async (req: any, res) => {
  try {
    const result = await CCDCChildService.batchConfirm(req.body.batchId, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.get('/inventory/batches/:batchId', async (req: any, res) => {
  try {
    const result = await CCDCChildService.getBatch(req.params.batchId);
    if (!result) return res.status(404).json({ message: 'Không tìm thấy batch kiểm kê.' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

childRouter.get('/reports/export', async (req: any, res) => {
  try {
    const dashboard = await CCDCChildService.getDashboard(req.query);
    const workbook = new ExcelJS.Workbook();
    const overview = workbook.addWorksheet('Tong hop');
    overview.columns = [{ header: 'Chi tieu', key: 'label', width: 28 }, { header: 'So luong', key: 'value', width: 16 }];
    Object.entries({
      total: dashboard.total,
      available: dashboard.available,
      inUse: dashboard.inUse,
      transferring: dashboard.transferring,
      returned: dashboard.returned,
      damaged: dashboard.damaged,
      repairing: dashboard.repairing,
      lost: dashboard.lost,
      liquidated: dashboard.liquidated
    }).forEach(([label, value]) => overview.addRow({ label, value }));
    const statusSheet = workbook.addWorksheet('Theo trang thai');
    statusSheet.columns = [{ header: 'Trang thai', key: 'status', width: 24 }, { header: 'So luong', key: 'count', width: 16 }];
    Object.entries(dashboard.byStatus || {}).forEach(([status, count]) => statusSheet.addRow({ status, count }));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=ccdc_child_report.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

childRouter.post('/documents/generate', async (req: any, res) => {
  try {
    res.json({ success: true, message: 'Đã ghi nhận yêu cầu sinh biên bản. Mẫu Word/PDF chi tiết sẽ cấu hình theo biểu mẫu doanh nghiệp.', request: req.body });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

childRouter.delete('/attachment/:attachmentId', async (req: any, res) => {
  try {
    const attachmentId = parseInt(req.params.attachmentId, 10);
    const result = await CCDCChildService.deleteAttachment(attachmentId, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.delete('/files/:fileId', async (req: any, res) => {
  try {
    const fileId = parseInt(req.params.fileId, 10);
    const result = await CCDCChildService.deleteAttachment(fileId, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.get('/:childId', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    if (isNaN(childId)) return res.status(400).json({ message: 'ID mã con không hợp lệ.' });
    const includeDeleted = req.query.includeDeleted === 'true';
    const child = await CCDCChildService.getDetail(childId, includeDeleted);
    res.json(child);
  } catch (err: any) {
    res.status(404).json({ message: err.message });
  }
});

childRouter.post('/:childId/approval-request', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.createApprovalRequest(childId, req.body || {}, actor(req));
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.get('/:childId/timeline', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.getTimeline(childId);
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ message: err.message });
  }
});

childRouter.get('/:childId/files', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.listAttachments(childId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/upload', upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa có file upload.' });
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ message: 'Định dạng file không được hỗ trợ.' });
    const childId = parseInt(req.params.childId, 10);
    const dir = path.join(process.cwd(), 'uploads', 'ccdc-child', String(childId));
    fs.mkdirSync(dir, { recursive: true });
    const safeName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fullPath = path.join(dir, safeName);
    fs.writeFileSync(fullPath, req.file.buffer);
    const fileUrl = `/uploads/ccdc-child/${childId}/${safeName}`;
    const result = await CCDCChildService.addAttachment(childId, {
      fileName: req.body.fileName || req.file.originalname,
      fileUrl,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      fileType: req.file.mimetype,
      category: req.body.category || 'OTHER'
    }, actor(req));
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.get('/:childId/attachments', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.listAttachments(childId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/attachments', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.addAttachment(childId, req.body || {}, actor(req));
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/transfer', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.transfer(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/complete-transfer', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.completeTransfer(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/handover', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.handover(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/return', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.returnChild(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/confirm-stock-in', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.confirmStockIn(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/report-damage', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.reportDamage(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/mark-lost', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.markLost(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/mark-found', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.markFound(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/liquidate', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.liquidate(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/start-repair', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.startRepair(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/complete-repair', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.completeRepair(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/cancel', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.cancel(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.delete('/:childId', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.softDelete(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

childRouter.post('/:childId/inventory-check', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId, 10);
    const result = await CCDCChildService.inventoryCheck(childId, req.body || {}, actor(req));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

export { ccdcRouter, childRouter, approvalRouter };
