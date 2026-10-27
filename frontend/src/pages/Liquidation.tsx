import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { DateRangeModal } from '../components/DateRangeModal';
import { 
  Trash2, 
  Plus, 
  Download,
  Search, 
  X,
  ChevronRight,
  Package,
  DollarSign,
  Briefcase,
  Calendar,
  AlertCircle,
  FileCheck,
  Printer
} from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

export const Liquidation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  
  // Create Form State
  const [selectedAssets, setSelectedAssets] = useState<any[]>([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    liquidationDate: format(new Date(), 'yyyy-MM-dd'),
    liquidationType: 'SELL',
    reason: '',
    buyerName: '',
    totalValue: 0,
    documentNo: '',
    note: ''
  });

  const fromDate = searchParams.get('fromDate');
  const toDate = searchParams.get('toDate');

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const handleExportLiquidated = async (startDate: string, endDate: string) => {
    try {
      const response = await api.get('/assets/export-liquidated', {
        params: { startDate, endDate },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `bao_cao_thanh_ly_${startDate}_to_${endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Tải báo cáo thanh lý thành công!");
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi tải báo cáo thanh lý");
    }
  };

  const fetchReports = async () => {
    try {
      const res = await api.get('/assets', { 
        params: { 
          status: 'LIQUIDATED',
          createdFrom: fromDate || undefined,
          createdTo: toDate || undefined
        } 
      });
      setReports(res.data.assets);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [fromDate, toDate]);

  const searchAssets = async (val: string) => {
    setAssetSearch(val);
    if (val.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await api.get('/assets', { params: { search: val, limit: 5 } });
      setSearchResults(res.data.assets);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async () => {
    if (selectedAssets.length === 0) return toast.error('Vui lòng chọn tài sản thanh lý');
    if (!formData.reason) return toast.error('Vui lòng nhập lý do thanh lý');

    try {
      await api.post('/operational/liquidation', {
        assetIds: selectedAssets.map(a => a.id),
        ...formData
      });
      toast.success('Đã hoàn tất hồ sơ thanh lý tài sản');
      setShowCreate(false);
      setSelectedAssets([]);
      setFormData({ 
        liquidationDate: format(new Date(), 'yyyy-MM-dd'), 
        liquidationType: 'SELL', 
        reason: '', 
        buyerName: '', 
        totalValue: 0, 
        documentNo: '', 
        note: '' 
      });
      fetchReports();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handlePrintLiquidation = async (asset: any) => {
    try {
      const response = await api.get(`/operational/liquidation/asset/${asset.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tạo biên bản thanh lý.');
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-[32px] font-[900] text-[#0F172A] tracking-tight flex items-center">
            <Trash2 className="mr-3 h-8 w-8 text-slate-700" />
            Thanh lý tài sản
          </h1>
          <p className="text-slate-500 font-medium">Hoàn tất vòng đời tài sản (Bán, Hủy, Cho tặng, Trả NCC).</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 h-12 px-5 rounded-2xl font-bold flex items-center gap-2 shadow-sm transition-all"
          >
            <Download className="h-5 w-5 text-slate-500" /> Tải báo cáo
          </button>
          <button 
            onClick={() => setShowCreate(true)}
            className="bg-slate-900 text-white h-12 px-6 rounded-2xl font-bold flex items-center shadow-lg shadow-slate-200 hover:bg-black transition-all"
          >
            <Plus className="mr-2 h-5 w-5" /> Tạo hồ sơ thanh lý
          </button>
        </div>
      </div>

      {/* LIQUIDATED ASSETS LIST */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Danh sách tài sản Đã Thanh Lý (Đã khóa)</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Tài sản</th>
                <th className="px-6 py-4">Loại thanh lý</th>
                <th className="px-6 py-4">Ngày thanh lý</th>
                <th className="px-6 py-4">Nguyên giá</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4 text-right">Biên bản</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {reports.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-50 transition-colors opacity-75">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center"><Package className="h-5 w-5 text-slate-400" /></div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{asset.assetName}</p>
                        <p className="text-xs font-medium text-slate-500">{asset.assetCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-slate-600 uppercase">Thanh lý</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-500">
                    {format(new Date(asset.updatedAt), 'dd/MM/yyyy')}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-400 line-through">{asset.purchasePriceExVat?.toLocaleString()} đ</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="flex items-center text-slate-400 text-xs font-black italic">
                      <FileCheck className="mr-1 h-4 w-4" /> ĐÃ KHÓA
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => handlePrintLiquidation(asset)}
                      title="In biên bản thanh lý"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      <Printer className="h-4 w-4" /> In biên bản
                    </button>
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-400 italic">Chưa có tài sản nào được thanh lý.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}></div>
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl relative z-10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
              <h2 className="text-2xl font-black tracking-tight flex items-center">
                <Trash2 className="mr-3 h-7 w-7 text-slate-400" />
                Tạo hồ sơ thanh lý tài sản
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-slate-800 rounded-full transition-all">
                <X className="h-6 w-6 text-slate-400" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto space-y-6">
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-rose-500 mt-0.5" />
                <p className="text-xs text-rose-700 font-bold leading-relaxed uppercase tracking-tight">
                  Cảnh báo: Tài sản sau khi thanh lý sẽ bị KHÓA hoàn toàn. Không thể thực hiện bàn giao, điều chuyển hay báo hỏng.
                </p>
              </div>

              {/* Asset Selection */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Chọn tài sản cần thanh lý</label>
                <div className="relative">
                  <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Tìm theo mã hoặc tên tài sản..."
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-slate-200 transition-all font-medium text-slate-900"
                    value={assetSearch}
                    onChange={(e) => searchAssets(e.target.value)}
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl z-20 overflow-hidden">
                      {searchResults.map(a => (
                        <button 
                          key={a.id} 
                          className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between group"
                          onClick={() => { if (!selectedAssets.find(x => x.id === a.id)) setSelectedAssets([...selectedAssets, a]); setAssetSearch(''); setSearchResults([]); }}
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-800">{a.assetName}</p>
                            <p className="text-[10px] text-slate-400">{a.assetCode} - Trạng thái: {a.status}</p>
                          </div>
                          <Plus className="h-4 w-4 text-slate-300 group-hover:text-primary-500" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedAssets.map(a => (
                    <div key={a.id} className="flex items-center space-x-2 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full text-xs font-bold">
                      <span>{a.assetCode}</span>
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedAssets(selectedAssets.filter(x => x.id !== a.id))} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Loại thanh lý</label>
                  <select 
                    className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-slate-100 font-medium"
                    value={formData.liquidationType}
                    onChange={(e) => setFormData({...formData, liquidationType: e.target.value})}
                  >
                    <option value="SELL">Bán thanh lý</option>
                    <option value="DISPOSE">Hủy / Bỏ</option>
                    <option value="DONATE">Từ thiện / Cho tặng</option>
                    <option value="RETURN_SUPPLIER">Trả nhà cung cấp</option>
                    <option value="SCRAP">Bán phế liệu</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Giá trị thanh lý (VNĐ)</label>
                  <input 
                    type="number"
                    className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-slate-100 font-medium"
                    value={formData.totalValue}
                    onChange={(e) => setFormData({...formData, totalValue: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Ngày thanh lý</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-slate-100 font-medium"
                    value={formData.liquidationDate}
                    onChange={(e) => setFormData({...formData, liquidationDate: e.target.value})}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Số chứng từ / Hợp đồng</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-slate-100 font-medium"
                    value={formData.documentNo}
                    onChange={(e) => setFormData({...formData, documentNo: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Lý do thanh lý</label>
                <textarea 
                  placeholder="Nhập lý do cụ thể..."
                  className="w-full px-4 py-3.5 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-slate-100 font-medium h-24 resize-none"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                ></textarea>
              </div>
            </div>

            <div className="p-8 bg-slate-50/80 border-t border-slate-100 flex space-x-3">
              <button 
                onClick={() => setShowCreate(false)}
                className="flex-1 px-6 py-4 rounded-2xl font-bold text-slate-500 hover:bg-white transition-all uppercase tracking-widest text-xs"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleCreate}
                className="flex-[2] bg-slate-900 text-white px-6 py-4 rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-slate-200 uppercase tracking-widest text-xs"
              >
                Xác nhận thanh lý
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT MODAL */}
      <DateRangeModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onConfirm={handleExportLiquidated}
        title="Tải báo cáo Thanh lý tài sản"
      />
    </div>
  );
};
