import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCodeComponent from 'react-qr-code';
const QRCode = (QRCodeComponent as any).default || QRCodeComponent;
import { ArrowLeft, ArrowRightLeft, CheckCircle2, FileText, Loader2, Package, Paperclip, ShieldAlert, UserCheck, Wrench } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

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

export const ToolChildDetail: React.FC = () => {
  const { childId } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isAdmin } = useAuth();
  const [child, setChild] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'info' | 'timeline' | 'files' | 'repair'>('info');
  const [loading, setLoading] = useState(true);
  const [fileForm, setFileForm] = useState({ fileName: '', fileUrl: '', fileType: '', category: 'OTHER' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const canOperate = useMemo(() => isAdmin() || hasPermission('TOOL_UPDATE') || hasPermission('ASSET_UPDATE'), [hasPermission, isAdmin]);

  const load = async () => {
    try {
      const [detailRes, timelineRes, filesRes] = await Promise.all([
        api.get(`/ccdc-child/${childId}`),
        api.get(`/ccdc-child/${childId}/timeline`),
        api.get(`/ccdc-child/${childId}/attachments`)
      ]);
      setChild(detailRes.data);
      setTimeline(timelineRes.data.events || []);
      setAttachments(filesRes.data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không tìm thấy mã con CCDC.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [childId]);

  const quickAction = async (action: string) => {
    if (!canOperate) {
      toast.error('Bạn không có quyền thực hiện thao tác này.');
      return;
    }
    try {
      let payload: any = {};
      if (action === 'handover') {
        payload.user = window.prompt('Người nhận bàn giao', child.user || '') || child.user;
        payload.department = window.prompt('Phòng ban', child.department || '') || child.department;
        payload.location = window.prompt('Vị trí', child.location || '') || child.location;
      } else if (action === 'transfer') {
        payload.note = window.prompt('Ghi chú/lệnh điều chuyển', '') || '';
      } else if (action === 'return') {
        payload.note = window.prompt('Ghi chú thu hồi', '') || '';
      } else if (action === 'inventory-check') {
        payload.inventoryStatus = 'CHECKED';
        payload.note = window.prompt('Ghi chú kiểm kê', '') || '';
      } else if (action === 'start-repair') {
        payload.vendorName = window.prompt('Đơn vị sửa chữa', '') || '';
        payload.estimatedCost = Number(window.prompt('Chi phí dự kiến', '0') || 0);
        payload.expectedReturnDate = window.prompt('Ngày dự kiến trả về YYYY-MM-DD', '') || undefined;
        payload.note = window.prompt('Nội dung sửa chữa', '') || '';
      } else if (action === 'complete-repair') {
        payload.result = window.prompt('Kết quả SUCCESS hoặc FAILED', 'SUCCESS') || 'SUCCESS';
        if (payload.result.toUpperCase() === 'FAILED') {
          payload.nextStatus = window.prompt('Trạng thái tiếp theo DAMAGED hoặc LIQUIDATED', 'DAMAGED') || 'DAMAGED';
        }
        payload.actualCost = Number(window.prompt('Chi phí thực tế', '0') || 0);
        payload.note = window.prompt('Ghi chú hoàn tất', '') || '';
      } else if (action === 'mark-found') {
        payload.note = window.prompt('Ghi chú tìm lại', '') || '';
      } else {
        payload.note = window.prompt('Ghi chú/lý do', '') || '';
      }

      await api.post(`/ccdc-child/${child.id}/${action}`, payload);
      toast.success('Đã cập nhật mã con.');
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thực hiện thao tác.');
    }
  };

  const addAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/ccdc-child/${child.id}/attachments`, fileForm);
      toast.success('Đã thêm hồ sơ mã con.');
      setFileForm({ fileName: '', fileUrl: '', fileType: '', category: 'OTHER' });
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thêm hồ sơ.');
    }
  };

  const uploadRealFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.warning('Chưa chọn file.');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('category', fileForm.category);
      if (fileForm.fileName) formData.append('fileName', fileForm.fileName);
      await api.post(`/ccdc-child/${child.id}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Đã upload hồ sơ mã con.');
      setSelectedFile(null);
      setFileForm({ fileName: '', fileUrl: '', fileType: '', category: 'OTHER' });
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể upload hồ sơ.');
    }
  };

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>;

  if (!child) {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-amber-500 mb-3" />
        <h1 className="text-xl font-black text-slate-900">Không tìm thấy mã con CCDC</h1>
        <button onClick={() => navigate('/tools')} className="mt-4 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-black">Quay lại CCDC</button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 px-3 sm:px-4 pb-16">
      <button onClick={() => navigate(`/tools/${child.parentCcdcId}`)} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Quay lại mã cha
      </button>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mã con CCDC</p>
            <h1 className="font-mono text-xl sm:text-2xl font-black text-slate-950 mt-1">{child.childCode}</h1>
            <p className="text-sm font-bold text-slate-600 mt-2">{child.parent?.toolName}</p>
            <span className="inline-flex mt-3 px-3 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-black">{statusLabels[child.childStatus] || child.childStatus}</span>
          </div>
          <div className="bg-white p-3 border border-slate-200 rounded-xl w-fit"><QRCode value={child.childCode} size={120} /></div>
        </div>

        {canOperate && (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-5">
              <ActionButton label="Bàn giao" icon={<UserCheck />} onClick={() => quickAction('handover')} />
              <ActionButton label="Điều chuyển" icon={<ArrowRightLeft />} onClick={() => quickAction('transfer')} />
              {child.childStatus === 'TRANSFERRING' && <ActionButton label="Xác nhận nhận" icon={<ArrowRightLeft />} onClick={() => quickAction('complete-transfer')} />}
              <ActionButton label="Thu hồi" icon={<Package />} onClick={() => quickAction('return')} />
              {child.childStatus === 'RETURNED' && <ActionButton label="Nhập kho" icon={<Package />} onClick={() => quickAction('confirm-stock-in')} />}
              <ActionButton label="Báo hỏng" icon={<ShieldAlert />} onClick={() => quickAction('report-damage')} />
            {child.childStatus === 'DAMAGED' && <ActionButton label="Đưa đi sửa" icon={<Wrench />} onClick={() => quickAction('start-repair')} />}
            {child.childStatus === 'REPAIRING' && <ActionButton label="Đã sửa xong" icon={<CheckCircle2 />} onClick={() => quickAction('complete-repair')} />}
            <ActionButton label="Báo mất" icon={<ShieldAlert />} onClick={() => quickAction('mark-lost')} />
            {child.childStatus === 'LOST' && <ActionButton label="Đã tìm lại" icon={<CheckCircle2 />} onClick={() => quickAction('mark-found')} />}
            <ActionButton label="Kiểm kê" icon={<FileText />} onClick={() => quickAction('inventory-check')} />
          </div>
        )}
      </div>

      <div className="flex overflow-x-auto border border-slate-200 rounded-2xl bg-white">
        {[
          ['info', 'Thông tin'],
          ['timeline', 'Timeline'],
          ['files', 'Hồ sơ'],
          ['repair', 'Sửa chữa']
        ].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key as any)} className={`px-4 py-3 text-xs font-black shrink-0 ${activeTab === key ? 'text-primary-700 border-b-2 border-primary-600' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoCard title="Vận hành" rows={[
            ['Trạng thái', statusLabels[child.childStatus] || child.childStatus],
            ['Người giữ', child.user || 'Kho CCDC'],
            ['Phòng ban', child.department || '-'],
            ['Vị trí', child.location || '-'],
            ['Tình trạng', child.condition || '-']
          ]} />
          <InfoCard title="Thuộc tính" rows={[
            ['Mã cha', child.parentCode],
            ['Màu sắc', child.color || '-'],
            ['Kích thước', child.size || '-'],
            ['Đặc điểm', child.specification || '-'],
            ['Lô hàng', child.lotNumber || '-']
          ]} />
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          {timeline.map((event, index) => (
            <div key={index} className="border-l-2 border-primary-100 pl-4 pb-4">
              <p className="text-xs font-black text-slate-900">{new Date(event.at).toLocaleString('vi-VN')} - {event.action}</p>
              <p className="text-xs text-slate-500 mt-1">{event.performedBy || 'Hệ thống'} {event.before || event.after ? `| ${event.before || '-'} -> ${event.after || '-'}` : ''}</p>
              <p className="text-sm text-slate-700 mt-1 break-words">{String(event.note || '')}</p>
            </div>
          ))}
          {timeline.length === 0 && <p className="text-sm font-bold text-slate-400 text-center py-8">Chưa có timeline.</p>}
        </div>
      )}

      {activeTab === 'files' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
          {canOperate && (
            <form onSubmit={uploadRealFile} className="grid grid-cols-1 md:grid-cols-4 gap-2 border border-primary-100 bg-primary-50 rounded-2xl p-3">
              <input type="file" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold bg-white md:col-span-2" accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx" />
              <input placeholder="Tên hiển thị" value={fileForm.fileName} onChange={e => setFileForm({ ...fileForm, fileName: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold bg-white" />
              <select value={fileForm.category} onChange={e => setFileForm({ ...fileForm, category: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold bg-white">
                {['IMAGE_CURRENT', 'HANDOVER_DOCUMENT', 'DAMAGE_IMAGE', 'REPAIR_DOCUMENT', 'LIQUIDATION_DOCUMENT', 'OTHER'].map(item => <option key={item} value={item}>{item}</option>)}
              </select>
              <button className="md:col-span-4 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-black">Upload hồ sơ</button>
            </form>
          )}
          {canOperate && (
            <form onSubmit={addAttachment} className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input required placeholder="Tên file" value={fileForm.fileName} onChange={e => setFileForm({ ...fileForm, fileName: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold" />
              <input required placeholder="URL file" value={fileForm.fileUrl} onChange={e => setFileForm({ ...fileForm, fileUrl: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold md:col-span-2" />
              <select value={fileForm.category} onChange={e => setFileForm({ ...fileForm, category: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold">
                {['IMAGE_CURRENT', 'HANDOVER_DOCUMENT', 'DAMAGE_IMAGE', 'REPAIR_DOCUMENT', 'LIQUIDATION_DOCUMENT', 'OTHER'].map(item => <option key={item} value={item}>{item}</option>)}
              </select>
              <button className="md:col-span-4 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-black">Thêm hồ sơ</button>
            </form>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attachments.map(file => (
              <a key={file.id} href={file.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 border border-slate-200 rounded-xl p-3 hover:bg-slate-50">
                <Paperclip className="h-4 w-4 text-primary-600" />
                <span className="text-sm font-bold text-slate-800">{file.fileName}</span>
                <span className="ml-auto text-[10px] font-black text-slate-400">{file.category}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'repair' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
          {canOperate && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => quickAction('start-repair')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-black"><Wrench className="h-4 w-4" /> Bắt đầu sửa</button>
              <button onClick={() => quickAction('complete-repair')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-teal-200 text-teal-700 text-sm font-black">Hoàn tất sửa</button>
            </div>
          )}
          {(child.repairs || []).map((repair: any) => (
            <div key={repair.id} className="border border-slate-200 rounded-xl p-3 text-sm">
              <p className="font-black text-slate-900">{repair.repairCode} - {repair.status}</p>
              <p className="text-slate-500 mt-1">{repair.vendorName || 'Chưa có đơn vị sửa'} | Dự kiến: {repair.expectedReturnDate ? new Date(repair.expectedReturnDate).toLocaleDateString('vi-VN') : '-'}</p>
              <p className="text-slate-700 mt-1">{repair.repairDescription || repair.damageDescription || '-'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ActionButton: React.FC<{ label: string; icon: React.ReactElement; onClick: () => void }> = ({ label, icon, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 min-h-16 rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-700 hover:bg-white">
    {React.cloneElement(icon, { className: 'h-4 w-4' } as any)}
    {label}
  </button>
);

const InfoCard: React.FC<{ title: string; rows: [string, string][] }> = ({ title, rows }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
    <h2 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-4">{title}</h2>
    <div className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 text-sm">
          <span className="text-slate-400 font-bold">{label}</span>
          <span className="text-slate-800 font-bold text-right">{value}</span>
        </div>
      ))}
    </div>
  </div>
);
