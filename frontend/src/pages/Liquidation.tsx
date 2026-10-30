import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { DateRangeModal } from '../components/DateRangeModal';
import { LiquidationMinutesModal } from '../components/LiquidationMinutesModal';
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
  Printer,
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowUpDown
} from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

type LiquidationSortKey = 'asset' | 'level4' | 'document' | 'type' | 'date' | 'price' | 'status';

export const Liquidation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReportKeys, setSelectedReportKeys] = useState<string[]>([]);
  const [minutesAssets, setMinutesAssets] = useState<any[] | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    level4: '',
    liquidationType: '',
    status: '',
    fromDate: '',
    toDate: '',
    minPrice: '',
    maxPrice: ''
  });
  const [reportSort, setReportSort] = useState<{ key: LiquidationSortKey; direction: 'asc' | 'desc' }>({
    key: 'asset',
    direction: 'asc'
  });
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
      const res = await api.get('/operational/liquidation', {
        params: { 
          fromDate: fromDate || undefined,
          toDate: toDate || undefined
        } 
      });
      const ledgerRows = (res.data.records || []).flatMap((record: any) =>
        (record.items || []).map((item: any) => ({
          ...item.asset,
          liquidationRecord: record
        }))
      );
      setReports(ledgerRows);
      setSelectedReportKeys([]);
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
    const recordId = asset.liquidationRecord?.id;
    setMinutesAssets(recordId ? reports.filter((item) => item.liquidationRecord?.id === recordId) : [asset]);
  };

  const liquidationTypeLabel = (type?: string) => ({
    SELL: 'Bán thanh lý',
    DISPOSE: 'Hủy / bỏ',
    DONATE: 'Cho tặng',
    RETURN_SUPPLIER: 'Trả NCC',
    SCRAP: 'Bán phế liệu'
  }[String(type || '')] || 'Thanh lý');

  const getReportKey = (asset: any) => `${asset.liquidationRecord?.id || 'unknown'}-${asset.id}`;
  const level4Options = Array.from(new Set(reports.map((asset) => asset.level4Name).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'vi'));
  const filteredReports = reports.filter((asset) => {
    const normalizedSearch = filters.search.trim().toLocaleLowerCase('vi');
    const record = asset.liquidationRecord || {};
    const searchable = [asset.assetCode, asset.assetName, asset.level4Name, record.liquidationCode, record.documentNo]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('vi');
    if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
    if (filters.level4 && asset.level4Name !== filters.level4) return false;
    if (filters.liquidationType && record.liquidationType !== filters.liquidationType) return false;
    if (filters.status === 'LOCKED' && !asset.isLocked) return false;
    if (filters.status === 'UNLOCKED' && asset.isLocked) return false;
    const liquidationDate = record.liquidationDate ? new Date(record.liquidationDate) : null;
    if (filters.fromDate && (!liquidationDate || liquidationDate < new Date(`${filters.fromDate}T00:00:00`))) return false;
    if (filters.toDate && (!liquidationDate || liquidationDate > new Date(`${filters.toDate}T23:59:59`))) return false;
    const price = Number(asset.purchasePriceExVat || 0);
    if (filters.minPrice !== '' && price < Number(filters.minPrice)) return false;
    if (filters.maxPrice !== '' && price > Number(filters.maxPrice)) return false;
    return true;
  });
  const selectedReports = reports.filter((asset) => selectedReportKeys.includes(getReportKey(asset)));
  const isAllReportsSelected = filteredReports.length > 0 && filteredReports.every((asset) => selectedReportKeys.includes(getReportKey(asset)));
  const toggleReportSort = (key: LiquidationSortKey) => {
    setReportSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  };

  const getReportSortValue = (asset: any, key: LiquidationSortKey): string | number => {
    switch (key) {
      case 'asset': return `${asset.assetName || ''} ${asset.assetCode || ''}`;
      case 'level4': return `${asset.level4Name || ''} ${asset.level4Code || ''}`;
      case 'document': return asset.liquidationRecord?.liquidationCode || asset.liquidationRecord?.documentNo || '';
      case 'type': return liquidationTypeLabel(asset.liquidationRecord?.liquidationType);
      case 'date': return asset.liquidationRecord?.liquidationDate ? new Date(asset.liquidationRecord.liquidationDate).getTime() : 0;
      case 'price': return Number(asset.purchasePriceExVat || 0);
      case 'status': return 'Đã khóa';
    }
  };

  const sortedReports = [...filteredReports].sort((left, right) => {
    const leftValue = getReportSortValue(left, reportSort.key);
    const rightValue = getReportSortValue(right, reportSort.key);
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'vi', { sensitivity: 'base', numeric: true });
    return reportSort.direction === 'asc' ? comparison : -comparison;
  });

  const renderSortHeader = (label: string, key: LiquidationSortKey) => {
    const isActive = reportSort.key === key;
    const title = isActive
      ? `Đang sắp xếp ${reportSort.direction === 'asc' ? 'A–Z' : 'Z–A'}. Bấm để đảo thứ tự.`
      : `Sắp xếp ${label} A–Z`;
    return (
      <button
        type="button"
        onClick={() => toggleReportSort(key)}
        className={`inline-flex items-center gap-1.5 transition-colors hover:text-slate-700 ${isActive ? 'text-slate-700' : ''}`}
        title={title}
      >
        {label}
        {isActive
          ? (reportSort.direction === 'asc' ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpAZ className="h-3.5 w-3.5" />)
          : <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />}
      </button>
    );
  };

  const toggleReportSelection = (asset: any) => {
    const key = getReportKey(asset);
    setSelectedReportKeys((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  };

  const toggleAllReportSelection = () => {
    setSelectedReportKeys((current) => isAllReportsSelected
      ? current.filter((key) => !filteredReports.some((asset) => getReportKey(asset) === key))
      : Array.from(new Set([...current, ...filteredReports.map(getReportKey)])));
  };

  const clearFilters = () => setFilters({ search: '', level4: '', liquidationType: '', status: '', fromDate: '', toDate: '', minPrice: '', maxPrice: '' });

  const handlePrintSelectedReports = () => {
    if (selectedReports.length === 0) return;
    setMinutesAssets(selectedReports);
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
          {selectedReports.length > 0 && (
            <button
              type="button"
              onClick={handlePrintSelectedReports}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-black"
            >
              <Printer className="h-4 w-4" /> In biên bản thanh lý ({selectedReports.length})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative block xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Tìm mã, tên tài sản hoặc số hồ sơ..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-slate-400"
            />
          </label>
          <select value={filters.level4} onChange={(event) => setFilters((current) => ({ ...current, level4: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400">
            <option value="">Tất cả nhóm LV4</option>
            {level4Options.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={filters.liquidationType} onChange={(event) => setFilters((current) => ({ ...current, liquidationType: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400">
            <option value="">Tất cả loại thanh lý</option>
            <option value="SELL">Bán thanh lý</option>
            <option value="DISPOSE">Hủy / bỏ</option>
            <option value="DONATE">Cho tặng</option>
            <option value="RETURN_SUPPLIER">Trả NCC</option>
            <option value="SCRAP">Bán phế liệu</option>
          </select>
          <label className="text-xs font-bold text-slate-500">Từ ngày<input type="date" value={filters.fromDate} onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-slate-400" /></label>
          <label className="text-xs font-bold text-slate-500">Đến ngày<input type="date" value={filters.toDate} onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-slate-400" /></label>
          <label className="text-xs font-bold text-slate-500">Nguyên giá từ<input type="number" min="0" value={filters.minPrice} onChange={(event) => setFilters((current) => ({ ...current, minPrice: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-slate-400" /></label>
          <label className="text-xs font-bold text-slate-500">Nguyên giá đến<input type="number" min="0" value={filters.maxPrice} onChange={(event) => setFilters((current) => ({ ...current, maxPrice: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-slate-400" /></label>
          <div className="flex items-end gap-2"><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"><option value="">Mọi trạng thái</option><option value="LOCKED">Đã khóa</option><option value="UNLOCKED">Chưa khóa</option></select><button type="button" onClick={clearFilters} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Xóa lọc</button></div>
        </div>
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-2 text-xs font-medium text-slate-500">Hiển thị {filteredReports.length}/{reports.length} tài sản</div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="w-12 px-4 py-4 text-center">
                  <input
                    type="checkbox"
                    checked={isAllReportsSelected}
                    onChange={toggleAllReportSelection}
                    aria-label="Chọn tất cả tài sản thanh lý"
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                </th>
                <th className="px-6 py-4">{renderSortHeader('Tài sản', 'asset')}</th>
                <th className="px-6 py-4">{renderSortHeader('Nhóm LV4', 'level4')}</th>
                <th className="px-6 py-4">{renderSortHeader('Số hồ sơ', 'document')}</th>
                <th className="px-6 py-4">{renderSortHeader('Loại thanh lý', 'type')}</th>
                <th className="px-6 py-4">{renderSortHeader('Ngày thanh lý', 'date')}</th>
                <th className="px-6 py-4">{renderSortHeader('Nguyên giá', 'price')}</th>
                <th className="px-6 py-4">{renderSortHeader('Trạng thái', 'status')}</th>
                <th className="px-6 py-4 text-right">Biên bản</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sortedReports.map((asset) => (
                <tr key={`${asset.liquidationRecord?.id}-${asset.id}`} className="hover:bg-slate-50 transition-colors opacity-75">
                  <td className="px-4 py-4 text-center">
                    <input
                      type="checkbox"
                      checked={selectedReportKeys.includes(getReportKey(asset))}
                      onChange={() => toggleReportSelection(asset)}
                      aria-label={`Chọn ${asset.assetCode}`}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                  </td>
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
                    <p className="text-xs font-semibold text-slate-600">{asset.level4Name || '---'}</p>
                    {asset.level4Code && <p className="mt-0.5 text-[10px] font-medium text-slate-400">{asset.level4Code}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-bold text-slate-700">{asset.liquidationRecord?.liquidationCode || '---'}</p>
                    {asset.liquidationRecord?.documentNo && <p className="mt-0.5 text-[10px] text-slate-400">{asset.liquidationRecord.documentNo}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-bold text-slate-600 uppercase">{liquidationTypeLabel(asset.liquidationRecord?.liquidationType)}</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-500">
                    {asset.liquidationRecord?.liquidationDate ? format(new Date(asset.liquidationRecord.liquidationDate), 'dd/MM/yyyy') : '---'}
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
                  <td colSpan={9} className="px-6 py-20 text-center text-slate-400 italic">Chưa có hồ sơ thanh lý nào trong sổ sách.</td>
                </tr>
              )}
              {reports.length > 0 && sortedReports.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center text-slate-400 italic">Không có tài sản phù hợp với bộ lọc.</td>
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
      {minutesAssets && (
        <LiquidationMinutesModal
          assets={minutesAssets}
          onClose={() => setMinutesAssets(null)}
        />
      )}
    </div>
  );
};
