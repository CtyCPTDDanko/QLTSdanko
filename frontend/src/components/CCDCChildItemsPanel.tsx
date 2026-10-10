import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCodeComponent from 'react-qr-code';
import { toast } from 'react-toastify';

const QRCode = (QRCodeComponent as any).default || QRCodeComponent;
import api from '../lib/api';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Download,
  Eye,
  FileDown,
  PackagePlus,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Undo2,
  UserCheck,
  X
} from 'lucide-react';

type ChildItem = {
  id: number;
  parentCcdcId: number;
  parentCode: string;
  childCode: string;
  quantity?: number;
  lotNumber?: string | null;
  color?: string | null;
  size?: string | null;
  specification?: string | null;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  supplierName?: string | null;
  imageUrl?: string | null;
  location?: string | null;
  department?: string | null;
  user?: string | null;
  childStatus: string;
  inventoryStatus: string;
  condition?: string | null;
  note?: string | null;
  hasHandover: boolean;
  hasTransfer: boolean;
  isPrinted: boolean;
  lastInventoryAt?: string | null;
};

const statusLabels: Record<string, string> = {
  AVAILABLE: 'Khả dụng',
  IN_USE: 'Đang dùng',
  TRANSFERRING: 'Đang chuyển',
  RETURNED: 'Đã thu hồi',
  DAMAGED: 'Hỏng',
  REPAIRING: 'Đang sửa',
  LOST: 'Mất',
  LIQUIDATED: 'Thanh lý',
  CANCELLED: 'Đã hủy'
};

const statusClass: Record<string, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  IN_USE: 'bg-blue-50 text-blue-700 border-blue-100',
  TRANSFERRING: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  RETURNED: 'bg-amber-50 text-amber-700 border-amber-100',
  DAMAGED: 'bg-orange-50 text-orange-700 border-orange-100',
  REPAIRING: 'bg-teal-50 text-teal-700 border-teal-100',
  LOST: 'bg-red-50 text-red-700 border-red-100',
  LIQUIDATED: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-zinc-100 text-zinc-500 border-zinc-200'
};

const emptyCreateForm = {
  quantity: 1,
  color: '',
  size: '',
  specification: '',
  lotNumber: '',
  purchaseDate: '',
  supplierName: '',
  imageUrl: '',
  serialNumber: '',
  location: '',
  department: '',
  user: '',
  note: ''
};

const emptyFilters = {
  search: '',
  status: '',
  location: '',
  department: '',
  user: '',
  color: '',
  lotNumber: ''
};

const parseChildSequence = (childCode: string) => {
  const typed = childCode.match(/-(?:I|G|B)(\d+)(?:-SL\d+)?$/i);
  if (typed) return Number(typed[1]);
  const legacy = childCode.match(/-(\d+)$/);
  return legacy ? Number(legacy[1]) : 0;
};

const childCodePrefixForSplitMode = (splitMode: 'quantity' | 'individual' | 'combo') => {
  if (splitMode === 'quantity') return 'G';
  if (splitMode === 'combo') return 'B';
  return 'I';
};

const composePreviewChildCode = (parentCode: string, seq: number, splitMode: 'quantity' | 'individual' | 'combo', quantity: number) => {
  const prefix = childCodePrefixForSplitMode(splitMode);
  const quantitySuffix = prefix === 'I' ? '' : `-SL${Math.max(1, Math.floor(Number(quantity || 1)))}`;
  return `${parentCode}-${prefix}${String(seq).padStart(2, '0')}${quantitySuffix}`;
};

export const CCDCChildItemsPanel: React.FC<{ parentTool: any }> = ({ parentTool }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ChildItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createStep, setCreateStep] = useState(1);
  const [splitMode, setSplitMode] = useState<'quantity' | 'individual' | 'combo'>('quantity');
  const [applyAllRows, setApplyAllRows] = useState(true);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [needsManualRefresh, setNeedsManualRefresh] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const limit = 50;

  const remainingToSplit = useMemo(() => {
    const created = summary?.createdChildCount || 0;
    return Math.max((parentTool.quantity || 0) - created, 0);
  }, [parentTool.quantity, summary]);

  const buildPreviewRows = (quantity = Number(createForm.quantity || 0)) => {
    const manualSerials = createForm.serialNumber
      .split(/[\n,;]/)
      .map(serial => serial.trim())
      .filter(Boolean);
    const rowCount = splitMode === 'quantity' || splitMode === 'combo'
      ? 1
      : splitMode === 'individual'
        ? Math.max(manualSerials.length, 1)
        : quantity;
    const existingCodes = new Set(items.map(item => item.childCode));
    let maxSeq = 0;
    for (const item of items) {
      maxSeq = Math.max(maxSeq, parseChildSequence(item.childCode));
    }
    const rows = Array.from({ length: rowCount }).map((_, index) => {
      let seq = maxSeq + index + 1;
      const rowQuantity = splitMode === 'quantity' || splitMode === 'combo' ? quantity : 1;
      let childCode = composePreviewChildCode(parentTool.toolCode, seq, splitMode, rowQuantity);
      while (existingCodes.has(childCode)) {
        seq += 1;
        childCode = composePreviewChildCode(parentTool.toolCode, seq, splitMode, rowQuantity);
      }
      existingCodes.add(childCode);
      const common = applyAllRows ? createForm : emptyCreateForm;
      return {
        childCode,
        quantity: rowQuantity,
        serialNumber: splitMode === 'individual' ? (manualSerials[index] || '') : '',
        color: common.color,
        size: common.size,
        specification: common.specification,
        lotNumber: common.lotNumber,
        purchaseDate: common.purchaseDate,
        supplierName: common.supplierName,
        location: common.location,
        department: common.department,
        user: common.user,
        imageUrl: common.imageUrl,
        note: common.note
      };
    });
    setPreviewRows(rows);
    return rows;
  };

  const updatePreviewRow = (index: number, patch: any) => {
    setPreviewRows(prev => prev.map((row, idx) => idx === index ? { ...row, ...patch } : row));
  };

  const importChildRows = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const rows = text.split(/\r?\n/).map(line => line.split(',').map(cell => cell.trim())).filter(row => row.some(Boolean));
      const dataRows = rows[0]?.some(cell => /serial|mã|ma|color|màu/i.test(cell)) ? rows.slice(1) : rows;
      const imported = buildPreviewRows(dataRows.length).map((row, index) => {
        const cells = dataRows[index] || [];
        return {
          ...row,
          serialNumber: cells[0] || row.serialNumber,
          color: cells[1] || row.color,
          size: cells[2] || row.size,
          specification: cells[3] || row.specification,
          lotNumber: cells[4] || row.lotNumber,
          location: cells[5] || row.location,
          department: cells[6] || row.department,
          user: cells[7] || row.user,
          note: cells[8] || row.note
        };
      });
      setCreateForm(prev => ({ ...prev, quantity: imported.length || prev.quantity }));
      setPreviewRows(imported);
      setCreateStep(2);
    };
    reader.readAsText(file);
  };

  const loadChildren = async (nextPage = page) => {
    setLoading(true);
    try {
      const res = await api.get(`/ccdc/${parentTool.id}/child-items`, {
        params: { ...filters, page: nextPage, limit, sortBy: 'childCode', sortOrder: 'asc' }
      });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      setSummary(res.data.parentSummary);
      setSelectedIds([]);
      setNeedsManualRefresh(false);
      setPage(nextPage);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách mã con.');
    } finally {
      setLoading(false);
    }
  };

  const pollSummary = async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const res = await api.get(`/ccdc/${parentTool.id}/child-summary`);
      if (res.data.summaryReady) {
        setSummary(res.data.parentSummary);
        setNeedsManualRefresh(false);
        return;
      }
    }
    setNeedsManualRefresh(true);
  };

  const handleOperationResponse = async (data: any) => {
    toast.success(data.message || 'Thao tác thành công.');
    if (data.summaryReady === false) {
      await pollSummary();
    } else {
      setSummary(data.parentSummary);
    }
    await loadChildren(page);
  };

  useEffect(() => {
    loadChildren(1);
  }, [parentTool.id]);

  const createChildren = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createStep === 1) {
      buildPreviewRows();
      setCreateStep(2);
      return;
    }
    if (createStep === 2) {
      setCreateStep(3);
      return;
    }
    try {
      const rows = previewRows.length ? previewRows : buildPreviewRows();
      const totalQuantity = rows.reduce((sum, row) => sum + Math.max(1, Math.floor(Number(row.quantity || 1))), 0);
      const res = await api.post(`/ccdc/${parentTool.id}/child-items`, {
        ...createForm,
        quantity: totalQuantity,
        splitMode,
        items: rows
      });
      toast.success(`Da tao ${res.data.createdCount || rows.length} ma con.`);
      setCreateForm(emptyCreateForm);
      setPreviewRows([]);
      setCreateStep(1);
      setSplitMode('quantity');
      setShowCreate(false);
      await handleOperationResponse(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Khong the tao ma con.');
    }
  };

  const runAction = async (child: ChildItem, action: string) => {
    try {
      let payload: any = {};
      let endpoint = action;
      if (action === 'handover') {
        const user = window.prompt('Người nhận bàn giao', child.user || '');
        if (user === null) return;
        payload.user = user;
        payload.department = window.prompt('Phòng ban', child.department || '') || child.department;
        payload.location = window.prompt('Vị trí', child.location || '') || child.location;
      } else if (action === 'transfer') {
        payload.note = window.prompt('Ghi chú/lệnh điều chuyển', '') || '';
      } else if (action === 'complete-transfer') {
        payload.finalUser = window.prompt('Người dùng cuối. Để trống nếu chuyển về kho', child.user || '') || '';
        payload.finalDepartment = window.prompt('Phòng ban/vị trí nhận', child.department || '') || child.department;
        payload.finalLocation = window.prompt('Vị trí nhận', child.location || '') || child.location;
      } else if (action === 'return') {
        payload.note = window.prompt('Ghi chú thu hồi', '') || '';
      } else if (action === 'confirm-stock-in') {
        payload.location = window.prompt('Vị trí nhập kho', child.location || 'KHO CCDC') || child.location;
      } else if (['report-damage', 'mark-lost', 'liquidate'].includes(action)) {
        payload.note = window.prompt('Ghi chú/lý do', '') || '';
      } else if (action === 'start-repair') {
        payload.damageDescription = window.prompt('Mô tả hư hỏng', child.note || '') || child.note;
        payload.note = window.prompt('Nội dung sửa chữa', '') || '';
      } else if (action === 'complete-repair') {
        payload.result = 'SUCCESS';
        payload.note = window.prompt('Ghi chú hoàn tất sửa chữa', '') || '';
      } else if (action === 'mark-found') {
        payload.note = window.prompt('Ghi chú tìm lại', '') || '';
      } else if (action === 'cancel') {
        const reason = window.prompt('Lý do hủy mã con');
        if (!reason) return;
        payload.reason = reason;
      } else if (action === 'delete') {
        const reason = window.prompt('Lý do xóa mềm mã con');
        if (!reason) return;
        endpoint = '';
        const res = await api.delete(`/ccdc-child/${child.id}`, { data: { reason } });
        await handleOperationResponse(res.data);
        return;
      }

      const res = await api.post(`/ccdc-child/${child.id}/${endpoint}`, payload);
      await handleOperationResponse(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thực hiện thao tác.');
    }
  };

  const runBulkAction = async (action: string) => {
    if (!selectedIds.length) {
      toast.warning('Chưa chọn mã con.');
      return;
    }
    try {
      let payload: any = {};
      if (action === 'HANDOVER') {
        payload.user = window.prompt('Người nhận bàn giao', '') || '';
        payload.department = window.prompt('Phòng ban', '') || '';
        payload.location = window.prompt('Vị trí', '') || '';
      } else if (action === 'TRANSFER') {
        payload.note = window.prompt('Ghi chú/lệnh điều chuyển', '') || '';
      } else if (action === 'RETURN') {
        payload.note = window.prompt('Ghi chú thu hồi', '') || '';
      } else if (action === 'INVENTORY_CHECK') {
        payload.inventoryStatus = 'CHECKED';
        payload.note = window.prompt('Ghi chú kiểm kê', '') || '';
      }
      const res = await api.post('/ccdc-child/bulk-action', { childIds: selectedIds, action, payload });
      toast.success(`Bulk ${action}: ${res.data.success}/${res.data.total} thành công.`);
      if (action === 'PRINT_QR') {
        items.filter(item => selectedIds.includes(item.id)).forEach(printQr);
      }
      await loadChildren(page);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể chạy bulk action.');
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Mã con', 'Trạng thái', 'Kiểm kê', 'Vị trí', 'Phòng ban', 'Người dùng', 'Màu sắc', 'Kích thước', 'Lô hàng', 'Ghi chú'],
      ...items.map(item => [
        item.childCode,
        statusLabels[item.childStatus] || item.childStatus,
        item.inventoryStatus,
        item.location || '',
        item.department || '',
        item.user || '',
        item.color || '',
        item.size || '',
        item.lotNumber || '',
        item.note || ''
      ])
    ];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ma_con_${parentTool.toolCode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printQr = (child: ChildItem) => {
    const win = window.open('', '_blank');
    if (!win) return;
    const qrSvg = document.getElementById(`ccdc-child-qr-${child.id}`)?.querySelector('svg')?.outerHTML || '';
    win.document.write(`
      <html><head><title>Tem ${child.childCode}</title></head>
      <body style="font-family:Arial;padding:24px;text-align:center">
        <div style="display:inline-block">${qrSvg}</div>
        <h3>${child.childCode}</h3>
        <p>${parentTool.toolName || ''}</p>
        <script>setTimeout(() => window.print(), 100);</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Tổng SL cha', parentTool.quantity || 0],
          ['Đã tạo', summary?.createdChildCount || 0],
          ['Khả dụng', summary?.availableCount || 0],
          ['Đang dùng', summary?.inUseCount || 0],
          ['Chưa tách', remainingToSplit]
        ].map(([label, value]) => (
          <div key={String(label)} className="border border-slate-200 rounded-xl bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="text-xl font-black text-slate-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-2 flex-1">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Tìm mã con, serial, vị trí, người dùng..." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
          </div>
          <select className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <input className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Vị trí" value={filters.location} onChange={e => setFilters({ ...filters, location: e.target.value })} />
          <input className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Phòng ban" value={filters.department} onChange={e => setFilters({ ...filters, department: e.target.value })} />
          <input className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Người dùng" value={filters.user} onChange={e => setFilters({ ...filters, user: e.target.value })} />
          <input className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Màu sắc" value={filters.color} onChange={e => setFilters({ ...filters, color: e.target.value })} />
          <input className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="Lô hàng" value={filters.lotNumber} onChange={e => setFilters({ ...filters, lotNumber: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => loadChildren(1)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Lọc</button>
          <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50"><FileDown className="h-4 w-4" /> Xuất Excel</button>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-600 text-white text-xs font-black hover:bg-primary-700"><PackagePlus className="h-4 w-4" /> Tạo mã con</button>
        </div>
      </div>

      {needsManualRefresh && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-amber-800">Số liệu tổng hợp chưa sẵn sàng.</span>
          <button onClick={() => loadChildren(page)} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-black">Tải lại số liệu</button>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="rounded-2xl border border-primary-100 bg-primary-50 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black text-primary-800 mr-2">Đã chọn {selectedIds.length} mã con</span>
          <button onClick={() => runBulkAction('TRANSFER')} className="px-3 py-2 rounded-xl bg-white border border-primary-200 text-xs font-black text-primary-700">Điều chuyển</button>
          <button onClick={() => runBulkAction('HANDOVER')} className="px-3 py-2 rounded-xl bg-white border border-primary-200 text-xs font-black text-primary-700">Bàn giao</button>
          <button onClick={() => runBulkAction('RETURN')} className="px-3 py-2 rounded-xl bg-white border border-primary-200 text-xs font-black text-primary-700">Thu hồi</button>
          <button onClick={() => runBulkAction('INVENTORY_CHECK')} className="px-3 py-2 rounded-xl bg-white border border-primary-200 text-xs font-black text-primary-700">Kiểm kê</button>
          <button onClick={() => runBulkAction('PRINT_QR')} className="px-3 py-2 rounded-xl bg-white border border-primary-200 text-xs font-black text-primary-700">In QR</button>
          <button onClick={() => setSelectedIds([])} className="px-3 py-2 rounded-xl text-xs font-black text-slate-500">Bỏ chọn</button>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-2xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selectedIds.length === items.length}
                  onChange={e => setSelectedIds(e.target.checked ? items.map(item => item.id) : [])}
                />
              </th>
              <th className="p-3">Mã con</th>
              <th className="p-3">QR</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3">Vận hành</th>
              <th className="p-3">Thuộc tính</th>
              <th className="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(child => {
              return (
                <tr key={child.id} className="hover:bg-slate-50/70">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(child.id)}
                      onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, child.id] : prev.filter(id => id !== child.id))}
                    />
                  </td>
                  <td className="p-3">
                    <button onClick={() => navigate(`/ccdc-child/${child.id}`)} className="font-mono text-xs font-black text-primary-700 hover:underline">{child.childCode}</button>
                    <p className="text-[11px] text-slate-400 font-bold mt-1">{child.parentCode}</p>
                  </td>
                  <td className="p-3"><div id={`ccdc-child-qr-${child.id}`} className="h-12 w-12 bg-white"><QRCode value={child.childCode} size={48} /></div></td>
                  <td className="p-3">
                    <span className={`inline-flex px-2 py-1 rounded-lg border text-[10px] font-black uppercase ${statusClass[child.childStatus] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{statusLabels[child.childStatus] || child.childStatus}</span>
                    <p className="text-[11px] text-slate-400 font-bold mt-1">KK: {child.inventoryStatus}</p>
                  </td>
                  <td className="p-3 text-xs font-semibold text-slate-600">
                    <p>{child.location || 'Chưa có vị trí'}</p>
                    <p>{child.department || 'Chưa có phòng ban'}</p>
                    <p>{child.user || 'Kho CCDC'}</p>
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    <p>SL: <b>{child.quantity || 1}</b></p>
                    <p>Màu: <b>{child.color || '-'}</b></p>
                    <p>Size: <b>{child.size || '-'}</b></p>
                    <p>Lô: <b>{child.lotNumber || '-'}</b></p>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <IconButton title="Xem" onClick={() => navigate(`/ccdc-child/${child.id}`)}><Eye className="h-3.5 w-3.5" /></IconButton>
                      <IconButton title="In QR" onClick={() => printQr(child)}><Printer className="h-3.5 w-3.5" /></IconButton>
                      <IconButton title="Bàn giao" onClick={() => runAction(child, 'handover')}><UserCheck className="h-3.5 w-3.5" /></IconButton>
                      <IconButton title="Điều chuyển" onClick={() => runAction(child, 'transfer')}><ArrowRightLeft className="h-3.5 w-3.5" /></IconButton>
                      <IconButton title="Hoàn tất điều chuyển" onClick={() => runAction(child, 'complete-transfer')}><CheckCircle2 className="h-3.5 w-3.5" /></IconButton>
                      <IconButton title="Thu hồi" onClick={() => runAction(child, 'return')}><Undo2 className="h-3.5 w-3.5" /></IconButton>
                      <IconButton title="Nhập kho" onClick={() => runAction(child, 'confirm-stock-in')}><Download className="h-3.5 w-3.5" /></IconButton>
                      <IconButton title="Báo hỏng" onClick={() => runAction(child, 'report-damage')}><AlertTriangle className="h-3.5 w-3.5" /></IconButton>
                      <IconButton title="Báo mất" onClick={() => runAction(child, 'mark-lost')}><ShieldAlert className="h-3.5 w-3.5" /></IconButton>
                      {child.childStatus === 'DAMAGED' && <button title="Đưa đi sửa" onClick={() => runAction(child, 'start-repair')} className="px-2 h-8 rounded-lg border border-teal-200 bg-white text-[10px] font-black text-teal-700 hover:bg-teal-50">Sửa</button>}
                      {child.childStatus === 'REPAIRING' && <button title="Đã sửa xong" onClick={() => runAction(child, 'complete-repair')} className="px-2 h-8 rounded-lg border border-emerald-200 bg-white text-[10px] font-black text-emerald-700 hover:bg-emerald-50">Sửa xong</button>}
                      {child.childStatus === 'LOST' && <button title="Đã tìm lại" onClick={() => runAction(child, 'mark-found')} className="px-2 h-8 rounded-lg border border-emerald-200 bg-white text-[10px] font-black text-emerald-700 hover:bg-emerald-50">Tìm lại</button>}
                      <button title="Thanh lý" onClick={() => runAction(child, 'liquidate')} className="px-2 h-8 rounded-lg border border-slate-200 bg-white text-[10px] font-black text-slate-600 hover:bg-slate-50">TL</button>
                      <button title="Hủy" onClick={() => runAction(child, 'cancel')} className="px-2 h-8 rounded-lg border border-amber-200 bg-white text-[10px] font-black text-amber-700 hover:bg-amber-50">Hủy</button>
                      <IconButton title="Xóa mềm" onClick={() => runAction(child, 'delete')}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-sm font-bold text-slate-400">Chưa có mã con nào.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
        <span>Tổng số: {total} mã con</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => loadChildren(page - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Trước</button>
          <button disabled={page * limit >= total} onClick={() => loadChildren(page + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Sau</button>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-slate-950/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={createChildren} className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-900">Tao ma con CCDC</h3>
                <p className="text-xs font-bold text-slate-400 mt-1">Buoc {createStep}/3: {createStep === 1 ? 'Thong tin chung' : createStep === 2 ? 'Xem truoc danh sach' : 'Xac nhan tao'}</p>
              </div>
              <button type="button" onClick={() => { setShowCreate(false); setCreateStep(1); setSplitMode('quantity'); setPreviewRows([]); }} className="p-2 rounded-lg hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {[
                  ['Ma CCDC cha', parentTool.toolCode],
                  ['Ten CCDC', parentTool.toolName],
                  ['Tong so luong', parentTool.quantity || 0],
                  ['Da tao ma con', summary?.createdChildCount || 0],
                  ['Con lai', remainingToSplit]
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-white rounded-xl border border-slate-100 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="text-sm font-black text-slate-800 mt-1 truncate">{value || '-'}</p>
                  </div>
                ))}
              </div>

              {createStep === 1 && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { key: 'quantity', title: 'Theo số lượng', desc: 'Tạo 1 mã con đại diện, số lượng nằm trên mã con.' },
                      { key: 'individual', title: 'Từng mã', desc: 'Nhập serial/mã thực tế từng dòng, mỗi dòng sinh một mã con.' },
                      { key: 'combo', title: 'Combo', desc: 'Giống CCDC cha: có thông tin chung và vẫn sửa từng mã ở preview.' }
                    ].map(mode => (
                      <button
                        key={mode.key}
                        type="button"
                        onClick={() => setSplitMode(mode.key as any)}
                        className={`text-left rounded-2xl border p-4 transition ${splitMode === mode.key ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        <p className="text-sm font-black">{mode.title}</p>
                        <p className="text-[11px] font-bold mt-1 opacity-70 leading-relaxed">{mode.desc}</p>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
                      <input type="checkbox" checked={applyAllRows} onChange={e => setApplyAllRows(e.target.checked)} />
                      Ap dung thong tin cho toan bo ma con
                    </label>
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 cursor-pointer hover:bg-slate-50">
                      Import Excel/CSV
                      <input type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={e => e.target.files?.[0] && importChildRows(e.target.files[0])} />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label={splitMode === 'individual' ? 'So luong (tu danh sach serial)' : 'So luong'} type="number" min={1} max={remainingToSplit || undefined} value={splitMode === 'individual' ? Math.max(createForm.serialNumber.split(/[\n,;]/).filter(Boolean).length, 1) : createForm.quantity} disabled={splitMode === 'individual'} onChange={(value: string) => setCreateForm({ ...createForm, quantity: Number(value) })} />
                    <Field label={splitMode === 'individual' ? 'Serial / ma tung dong' : 'Serial'} value={createForm.serialNumber} onChange={(value: string) => setCreateForm({ ...createForm, serialNumber: value })} />
                    <Field label="Mau sac" value={createForm.color} onChange={(value: string) => setCreateForm({ ...createForm, color: value })} />
                    <Field label="Kich thuoc" value={createForm.size} onChange={(value: string) => setCreateForm({ ...createForm, size: value })} />
                    <Field label="Dac diem" value={createForm.specification} onChange={(value: string) => setCreateForm({ ...createForm, specification: value })} />
                    <Field label="Lo hang" value={createForm.lotNumber} onChange={(value: string) => setCreateForm({ ...createForm, lotNumber: value })} />
                    <Field label="Ngay mua" type="date" value={createForm.purchaseDate} onChange={(value: string) => setCreateForm({ ...createForm, purchaseDate: value })} />
                    <Field label="Nha cung cap" value={createForm.supplierName} onChange={(value: string) => setCreateForm({ ...createForm, supplierName: value })} />
                    <Field label="Vi tri ban dau" value={createForm.location} onChange={(value: string) => setCreateForm({ ...createForm, location: value })} />
                    <Field label="Phong ban" value={createForm.department} onChange={(value: string) => setCreateForm({ ...createForm, department: value })} />
                    <Field label="Nguoi su dung" value={createForm.user} onChange={(value: string) => setCreateForm({ ...createForm, user: value })} />
                    <Field label="Anh URL" value={createForm.imageUrl} onChange={(value: string) => setCreateForm({ ...createForm, imageUrl: value })} />
                    <div className="md:col-span-3"><Field label="Ghi chu" value={createForm.note} onChange={(value: string) => setCreateForm({ ...createForm, note: value })} /></div>
                  </div>
                </>
              )}

              {createStep >= 2 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-800">Danh sach ma con xem truoc</h4>
                    <button type="button" onClick={() => buildPreviewRows()} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-700 hover:bg-slate-50">Sinh lai ma</button>
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                        <tr>
                          {['Ma con','SL','Serial','Mau','Size','Dac diem','Lo','Ngay mua','NCC','Vi tri','Phong ban','Nguoi dung','Anh','Ghi chu'].map(h => <th key={h} className="p-2 text-left">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, index) => (
                          <tr key={row.childCode} className="border-t border-slate-100">
                            <td className="p-2 font-mono font-black text-primary-700">{row.childCode}</td>
                            {['quantity','serialNumber','color','size','specification','lotNumber','purchaseDate','supplierName','location','department','user','imageUrl','note'].map(key => (
                              <td key={key} className="p-1 min-w-[130px]">
                                <input
                                  value={row[key] || ''}
                                  type={key === 'purchaseDate' ? 'date' : key === 'quantity' ? 'number' : 'text'}
                                  min={key === 'quantity' ? 1 : undefined}
                                  onChange={e => updatePreviewRow(index, { [key]: key === 'quantity' ? Math.max(1, Math.floor(Number(e.target.value || 1))) : e.target.value })}
                                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-semibold"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {createStep === 3 && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                      He thong se tao {previewRows.length} ma con voi tong so luong {previewRows.reduce((sum, row) => sum + Math.max(1, Math.floor(Number(row.quantity || 1))), 0)}, sinh QR theo tung ma va ghi lich su CREATE_CHILD. Moi ma con co the ban giao, dieu chuyen, thu hoi, bao hong, mat va thanh ly doc lap.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2 p-5 border-t border-slate-100 bg-white">
              <button type="button" onClick={() => createStep > 1 ? setCreateStep(createStep - 1) : (setShowCreate(false), setSplitMode('quantity'))} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-black text-slate-600">{createStep > 1 ? 'Quay lai' : 'Huy'}</button>
              <button type="submit" className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-black">{createStep === 1 ? 'Xem truoc' : createStep === 2 ? 'Tiep tuc xac nhan' : 'Xac nhan tao ma con'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const IconButton: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button title={title} onClick={onClick} className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
    {children}
  </button>
);

const Field: React.FC<any> = ({ label, value, onChange, ...props }) => (
  <label className="block">
    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</span>
    <input {...props} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500" />
  </label>
);
