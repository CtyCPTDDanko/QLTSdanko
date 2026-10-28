import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { toast } from 'react-toastify';
import { Building2, Plus, ChevronRight, CheckCircle2, XCircle, Info, Hash, Type, Link as LinkIcon, SortAsc, Activity, AlertTriangle, Eye, EyeOff, Download, Play, LoaderCircle } from 'lucide-react';

interface PathItem {
  id: number;
  name: string;
  level: number;
  code: string;
}

export const ClassificationSettings: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [path, setPath] = useState<PathItem[]>([]);
  const [revealedCompanies, setRevealedCompanies] = useState<number[]>([]);
  
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catFormData, setCatFormData] = useState({
    id: null as number | null,
    code: '',
    name: '',
    slug: '',
    sortOrder: 0,
    isActive: true
  });
  const [hasManuallyEditedSlug, setHasManuallyEditedSlug] = useState(false);

  const [isCompModalOpen, setIsCompModalOpen] = useState(false);
  const [compFormData, setCompFormData] = useState({ code: '', name: '' });
  const [isExporting, setIsExporting] = useState(false);
  const [isCompaniesExporting, setIsCompaniesExporting] = useState(false);
  const [isRuleConfirmOpen, setIsRuleConfirmOpen] = useState(false);
  const [isRunningRules, setIsRunningRules] = useState(false);

  const currentLevel = path.length + 1;
  const currentParentId = path.length > 0 ? path[path.length - 1].id : null;

  const loadData = async () => {
    try {
      const [compRes, catRes] = await Promise.all([
        api.get('/settings/companies'),
        api.get(`/settings/categories?level=${currentLevel}${currentParentId ? `&parentId=${currentParentId}` : ''}`)
      ]);
      setCompanies(compRes.data);
      setCategories(catRes.data);
    } catch (err) {
      toast.error("Failed to load settings");
    }
  };

  useEffect(() => {
    loadData();
  }, [path]);

  const generateSlug = (text: string) => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[đĐ]/g, 'd')
      .replace(/[^\w\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_');
  };

  const getSuggestedCode = () => {
    if (categories.length === 0) return '01';
    const numericCodes = categories
      .map(c => parseInt(c.code))
      .filter(n => !isNaN(n));
    if (numericCodes.length === 0) return '01';
    const max = Math.max(...numericCodes);
    return (max + 1).toString().padStart(2, '0');
  };

  const handleNameChange = (name: string) => {
    setCatFormData(prev => ({
      ...prev,
      name,
      slug: hasManuallyEditedSlug ? prev.slug : generateSlug(name)
    }));
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setError(null);
    const suggested = getSuggestedCode();
    setCatFormData({
      id: null,
      code: suggested,
      name: '',
      slug: '',
      sortOrder: categories.length + 1,
      isActive: true
    });
    setHasManuallyEditedSlug(false);
    setIsCatModalOpen(true);
  };

  const openEditModal = (cat: any) => {
    setIsEditMode(true);
    setError(null);
    setCatFormData({
      id: cat.id,
      code: cat.code,
      name: cat.name,
      slug: cat.slug || '',
      sortOrder: cat.sortOrder || 0,
      isActive: cat.isActive
    });
    setHasManuallyEditedSlug(true);
    setIsCatModalOpen(true);
  };

  const handleCatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      if (isEditMode) {
        await api.patch(`/settings/categories/${catFormData.id}`, catFormData);
        toast.success("Đã cập nhật danh mục thành công");
      } else {
        await api.post('/settings/categories', {
          ...catFormData,
          level: currentLevel,
          parentId: currentParentId
        });
        toast.success("Đã lưu danh mục thành công");
      }
      setIsCatModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || "Lỗi khi lưu danh mục. Vui lòng kiểm tra lại mã.");
    } finally {
      setIsSaving(false);
    }
  };

  const drillDown = (cat: any) => {
    if (cat.level < 4) {
      setPath([...path, { id: cat.id, name: cat.name, level: cat.level, code: cat.code }]);
    }
  };

  const navigateToLevel = (level: number) => {
    setPath(path.slice(0, level - 1));
  };

  const jumpToPathIndex = (index: number) => {
    if (index === -1) setPath([]);
    else setPath(path.slice(0, index + 1));
  };

  const toggleStatus = async (cat: any) => {
    try {
      await api.patch(`/settings/categories/${cat.id}`, { isActive: !cat.isActive });
      toast.success("Status updated");
      loadData();
    } catch (err) { toast.error("Update failed"); }
  };

  const toggleCompanyVisibility = (companyId: number) => {
    setRevealedCompanies(prev => 
      prev.includes(companyId) 
        ? prev.filter(id => id !== companyId) 
        : [...prev, companyId]
    );
  };

  const getLevelName = (level: number) => {
    switch(level) {
      case 1: return "nhóm Cấp 1";
      case 2: return "danh mục Cấp 2";
      case 3: return "loại tài sản Cấp 3";
      case 4: return "phân loại tài sản Cấp 4";
      default: return "danh mục";
    }
  };

  const handleCompSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/settings/companies', compFormData);
      toast.success("Company added");
      setIsCompModalOpen(false);
      setCompFormData({ code: '', name: '' });
      loadData();
    } catch (err) {
      toast.error("Failed to add company");
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await api.get('/settings/categories/export', { responseType: 'blob' });
      const file = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (file.size === 0) {
        throw new Error('Tệp xuất không có dữ liệu.');
      }
      const url = window.URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `phan-loai-tai-san-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep the object URL alive until the browser has finished reading it.
      window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
      toast.success('Đã xuất danh mục phân loại tài sản.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xuất danh mục phân loại.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCompaniesExport = async () => {
    setIsCompaniesExporting(true);
    try {
      const response = await api.get('/settings/companies/export', { responseType: 'blob' });
      const file = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (file.size === 0) throw new Error('Tệp xuất không có dữ liệu.');
      const url = window.URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `companies-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
      toast.success('Đã xuất danh sách Companies.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xuất danh sách Companies.');
    } finally {
      setIsCompaniesExporting(false);
    }
  };

  const handleRunAssetCodeRules = async () => {
    setIsRunningRules(true);
    try {
      const response = await api.post('/settings/asset-code-rules/run');
      const { processedAssets, validPaths, updatedCounters, skipped } = response.data;
      toast.success(`Đã rà soát ${processedAssets} tài sản, đồng bộ ${updatedCounters}/${validPaths} bộ đếm${skipped ? `; bỏ qua ${skipped} mã không khớp cấu trúc` : ''}.`);
      setIsRuleConfirmOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể chạy quy tắc tạo mã tài sản.');
    } finally {
      setIsRunningRules(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Asset Classification</h1>
          <p className="text-slate-500">Quản lý mã danh mục 4 cấp theo quy trình Master Data.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-primary-300 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => setIsRuleConfirmOpen(true)}
            className="btn-primary inline-flex items-center px-4 py-2.5 text-sm"
          >
            <Play className="mr-2 h-4 w-4" /> Chạy quy tắc tạo mã
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <div className="clay-surface rounded-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold flex items-center">
                <Building2 className="mr-2 h-5 w-5 text-primary-600" /> Companies
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCompaniesExport}
                  disabled={isCompaniesExporting}
                  className="p-2 hover:bg-slate-100 rounded-lg text-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Xuất Excel Companies"
                  aria-label="Xuất Excel Companies"
                >
                  {isCompaniesExporting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                </button>
                <button onClick={() => setIsCompModalOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg text-primary-600" title="Thêm công ty">
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {companies.map(c => {
                const isPublicCompany = c.code === '00' || c.code === '01' || c.name.toLowerCase().includes('danko group') || c.name.toLowerCase().includes('khong co thong tin');
                const isRevealed = revealedCompanies.includes(c.id);
                const displayName = isPublicCompany || isRevealed ? c.name : '*****';

                return (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/30">
                    <div className="flex items-center space-x-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{c.code}</p>
                        <p className="text-xs text-slate-500 font-medium">{displayName}</p>
                      </div>
                      {!isPublicCompany && (
                        <button 
                          onClick={() => toggleCompanyVisibility(c.id)} 
                          className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                          title={isRevealed ? "Ẩn tên công ty" : "Xem tên công ty"}
                        >
                          {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                      {c.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
           <div className="clay-table-shell rounded-3xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl">
                  {[1, 2, 3, 4].map(l => (
                    <button
                      key={l}
                      onClick={() => navigateToLevel(l)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        currentLevel === l 
                        ? 'bg-white text-primary-700 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Level {l}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={openAddModal}
                  className="btn-primary py-2 px-4 flex items-center text-sm"
                >
                  <Plus className="mr-2 h-4 w-4" /> 
                  Thêm {getLevelName(currentLevel)} 
                  {path.length > 0 ? ` thuộc ${path[path.length-1].code}` : ''}
                </button>
              </div>

              <div className="flex items-center text-xs mb-6 bg-slate-50 p-3 rounded-xl border border-slate-100 overflow-x-auto whitespace-nowrap">
                 <button onClick={() => jumpToPathIndex(-1)} className="text-slate-400 hover:text-primary-600 font-bold">Root</button>
                 {path.map((p, idx) => (
                   <React.Fragment key={p.id}>
                     <ChevronRight className="mx-1.5 h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                     <button onClick={() => jumpToPathIndex(idx)} className={`font-bold transition-colors ${idx === path.length - 1 ? 'text-primary-700' : 'text-slate-500 hover:text-primary-600'}`}>
                       {p.code} - {p.name}
                     </button>
                   </React.Fragment>
                 ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Mã</th>
                      <th className="px-6 py-3">Tên danh mục</th>
                      <th className="px-6 py-3">Thứ tự</th>
                      <th className="px-6 py-3">Trạng thái</th>
                      <th className="px-6 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categories.map(cat => (
                      <tr key={cat.id} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-primary-700">{cat.code}</td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-900">{cat.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono italic">{cat.slug}</div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">{cat.sortOrder}</td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => toggleStatus(cat)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                              cat.isActive ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                          >
                            {cat.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                             {cat.level < 4 && (
                               <button onClick={() => drillDown(cat)} className="p-2 hover:bg-primary-50 text-primary-600 rounded-lg" title="Xem danh mục con">
                                 <ChevronRight className="h-4 w-4" />
                               </button>
                             )}
                             <button onClick={() => openEditModal(cat)} className="p-2 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition-colors">
                                Chỉnh sửa
                             </button>
                           </div>
                        </td>
                      </tr>
                    ))}
                    {categories.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm italic">
                          Chưa có danh mục nào ở cấp này. Nhấn nút "Thêm" để bắt đầu.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
           </div>
        </div>
      </div>

      {/* CATEGORY MODAL */}
      {isCatModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div 
            className="clay-surface rounded-3xl w-full max-w-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-200"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsCatModalOpen(false);
              if (e.key === 'Enter' && e.ctrlKey) handleCatSubmit(e as any);
            }}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <h2 className="text-xl font-bold text-slate-900">
                {isEditMode ? 'Chỉnh sửa danh mục' : `Thêm ${getLevelName(currentLevel)}`}
              </h2>
              <button onClick={() => setIsCatModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 tracking-wider">Ngữ cảnh cha</div>
              <div className="flex items-center text-sm font-medium text-slate-600 overflow-x-auto whitespace-nowrap pb-1">
                <span className={path.length === 0 ? 'text-primary-600 font-bold' : ''}>Root</span>
                {path.map(p => (
                  <React.Fragment key={p.id}>
                    <ChevronRight className="mx-2 h-4 w-4 text-slate-300 flex-shrink-0" />
                    <span>{p.code} - {p.name}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <form onSubmit={handleCatSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start text-red-700 text-sm animate-pulse">
                  <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-bold text-slate-700">
                    <Hash className="h-4 w-4 mr-2 text-slate-400" /> Mã danh mục
                  </label>
                  <input 
                    autoFocus
                    type="text" 
                    className={`input-field font-mono font-bold ${categories.some(c => c.code === catFormData.code && c.id !== catFormData.id) ? 'border-red-300 focus:ring-red-200' : ''}`}
                    placeholder="01" 
                    required 
                    value={catFormData.code} 
                    onChange={e => setCatFormData({...catFormData, code: e.target.value})} 
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-400 italic">Mã định danh duy nhất trong cấp cha</p>
                    {!isEditMode && (
                      <button 
                        type="button" 
                        onClick={() => setCatFormData({...catFormData, code: getSuggestedCode()})}
                        className="text-[10px] text-primary-600 font-bold hover:underline"
                      >
                        Gợi ý: {getSuggestedCode()}
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center text-sm font-bold text-slate-700">
                    <SortAsc className="h-4 w-4 mr-2 text-slate-400" /> Thứ tự hiển thị
                  </label>
                  <input 
                    type="number" 
                    className="input-field" 
                    min="0"
                    value={catFormData.sortOrder} 
                    onChange={e => setCatFormData({...catFormData, sortOrder: parseInt(e.target.value) || 0})} 
                  />
                  <p className="text-[10px] text-slate-400 italic">Dùng để sắp xếp trong danh sách (0 là ưu tiên)</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center text-sm font-bold text-slate-700">
                  <Type className="h-4 w-4 mr-2 text-slate-400" /> Tên danh mục
                </label>
                <input 
                  type="text" 
                  className="input-field text-lg font-bold border-slate-300 focus:border-primary-500 shadow-sm" 
                  placeholder="Nhập tên danh mục tiếng Việt..." 
                  required 
                  value={catFormData.name} 
                  onChange={e => handleNameChange(e.target.value)} 
                />
                <p className="text-[10px] text-slate-400 italic font-medium">Tên hiển thị (ví dụ: Laptop, Máy ô tô phục vụ công tác...)</p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center text-sm font-bold text-slate-700">
                  <LinkIcon className="h-4 w-4 mr-2 text-slate-400" /> Slug (Mã kỹ thuật)
                </label>
                <input 
                  type="text" 
                  className="input-field font-mono text-sm bg-slate-50 border-dashed border-slate-300" 
                  placeholder="may_moc_thiet_bi" 
                  required 
                  value={catFormData.slug} 
                  onChange={e => {
                    setCatFormData({...catFormData, slug: e.target.value});
                    setHasManuallyEditedSlug(true);
                  }} 
                />
                <p className="text-[10px] text-slate-400 uppercase tracking-tighter font-mono">
                   Tự động sinh từ tên không dấu. Dùng cho xử lý kỹ thuật/import.
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-center text-sm font-bold text-slate-700">
                  <Activity className="h-4 w-4 mr-2 text-slate-400" /> Trạng thái hoạt động
                </label>
                <div className="flex items-center space-x-4">
                   <label className={`flex-1 flex items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer ${catFormData.isActive ? 'border-green-500 bg-green-50 text-green-700 shadow-sm' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}>
                      <input 
                        type="radio" 
                        className="hidden" 
                        checked={catFormData.isActive === true} 
                        onChange={() => setCatFormData({...catFormData, isActive: true})} 
                      />
                      <CheckCircle2 className={`h-5 w-5 mr-2 ${catFormData.isActive ? 'opacity-100 animate-in fade-in scale-in' : 'opacity-20'}`} />
                      <span className="font-bold uppercase text-[10px] tracking-widest">Đang hoạt động (Active)</span>
                   </label>
                   <label className={`flex-1 flex items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer ${!catFormData.isActive ? 'border-red-500 bg-red-50 text-red-700 shadow-sm' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}>
                      <input 
                        type="radio" 
                        className="hidden" 
                        checked={catFormData.isActive === false} 
                        onChange={() => setCatFormData({...catFormData, isActive: false})} 
                      />
                      <XCircle className={`h-5 w-5 mr-2 ${!catFormData.isActive ? 'opacity-100 animate-in fade-in scale-in' : 'opacity-20'}`} />
                      <span className="font-bold uppercase text-[10px] tracking-widest">Tạm ẩn (Inactive)</span>
                   </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-slate-100 sticky bottom-0 bg-white pb-2">
                <button 
                  type="button" 
                  onClick={() => setIsCatModalOpen(false)} 
                  className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Hủy bỏ
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving || (categories.some(c => c.code === catFormData.code && c.id !== catFormData.id))}
                  className={`btn-primary px-10 py-2.5 flex items-center shadow-lg shadow-primary-200 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSaving ? 'Đang lưu...' : (isEditMode ? 'Cập nhật danh mục' : 'Lưu danh mục')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPANY MODAL */}
      {isCompModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="clay-surface rounded-3xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold">Add New Company</h2>
            </div>
            <form onSubmit={handleCompSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Company Code</label>
                <input type="text" className="input-field" required value={compFormData.code} onChange={e => setCompFormData({...compFormData, code: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Company Name</label>
                <input type="text" className="input-field" required value={compFormData.name} onChange={e => setCompFormData({...compFormData, name: e.target.value})} />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button type="button" onClick={() => setIsCompModalOpen(false)} className="px-4 py-2">Cancel</button>
                <button type="submit" className="btn-primary px-6 py-2">Save Company</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRuleConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="clay-surface w-full max-w-lg overflow-hidden rounded-3xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3 border-b border-slate-100 p-6">
              <div className="rounded-xl bg-primary-50 p-3 text-primary-600"><Hash className="h-6 w-6" /></div>
              <div>
                <h2 className="text-lg font-black text-slate-900">Chạy quy tắc tạo mã tài sản</h2>
                <p className="mt-1 text-sm text-slate-500">Rà soát các mã đã có để chuẩn bị cho lần tạo mã tiếp theo.</p>
              </div>
            </div>
            <div className="space-y-3 p-6 text-sm leading-6 text-slate-600">
              <p>Hệ thống sẽ đồng bộ số thứ tự cao nhất của từng cấu trúc: <strong className="font-mono text-slate-800">Công ty.Cấp 1.Cấp 2.Cấp 3.Cấp 4.STT</strong>.</p>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                Thao tác này không đổi mã của tài sản đã phát sinh, chỉ bảo đảm mã tạo mới không bị trùng hoặc nhảy lùi số.
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-5">
              <button type="button" onClick={() => setIsRuleConfirmOpen(false)} disabled={isRunningRules} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-60">Hủy</button>
              <button type="button" onClick={handleRunAssetCodeRules} disabled={isRunningRules} className="btn-primary inline-flex items-center px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                {isRunningRules ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                {isRunningRules ? 'Đang chạy...' : 'Xác nhận chạy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
