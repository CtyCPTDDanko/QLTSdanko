import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import api from '../lib/api';
import { 
  Search, 
  Download, 
  MoreVertical, 
  Plus, 
  X, 
  FileUp, 
  AlertCircle, 
  Eye, 
  UserPlus, 
  ArrowRightLeft, 
  Wrench, 
  Trash2, 
  Box, 
  CheckCircle2, 
  RotateCcw, 
  ClipboardCheck, 
  MapPin, 
  Tag, 
  Printer, 
  ArrowUpDown, 
  ShieldAlert,
  CheckSquare,
  MinusSquare,
  Square,
  Activity,
  ChevronDown,
  Trash,
  Loader2,
  Filter,
  Edit3,
  Building2
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { AutocompleteInput, MultiSelect, PopoverFilter, FilterChip, ChipPopoverFilter } from '../components/FilterComponents';
import { Can } from '../components/Can';
import { useAuth } from '../context/AuthContext';
import { NormalizationModal } from '../components/NormalizationModal';
import { useModal } from '../context/ModalContext';
import { AssetGroupedView, type AssetGroupedBook } from '../components/AssetGroupedView';
import { AssetLocationHierarchyView } from '../components/AssetLocationHierarchyView';
import { getAssetStatusConfig } from '../constants/assetStatus';
import { getAssetAssigneeDisplay } from '../utils/assetAssignee';

const GROUPED_VIEW_FETCH_LIMIT = 10000;

export const AssetList: React.FC = () => {
  const { hasPermission } = useAuth();
  const { activeModal, openModal, closeModal } = useModal();
  const isDetailOpen = activeModal?.type === 'ASSET_DETAIL';
  const selectedAssetId = activeModal?.payload?.assetId;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [assets, setAssets] = useState<any[]>([]);
  const [groupedViewAssets, setGroupedViewAssets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [groupedViewLoading, setGroupedViewLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const assetRequestSeq = useRef(0);
  const groupedRequestSeq = useRef(0);
  
  // Sorting is kept in the URL; the table always renders the complete filtered dataset.
  const search = searchParams.get('search') || '';
  const sortBy = searchParams.get('sortBy') || 'lastActionAt';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  const initialSortApplied = useRef(false);

  // Every new visit starts with the operationally useful order. Preserve all
  // filters, but do not carry an old A-Z choice into a newly opened asset tab.
  useEffect(() => {
    if (initialSortApplied.current) return;
    initialSortApplied.current = true;

    if (searchParams.get('sortBy') === 'lastActionAt' && searchParams.get('sortOrder') === 'desc') return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('sortBy', 'lastActionAt');
    nextParams.set('sortOrder', 'desc');
    nextParams.set('page', '1');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Advanced Filters from URL
  const filters: any = {
    status: searchParams.get('status') || '',
    companyCode: searchParams.get('companyCode') || '',
    currentUserName: searchParams.get('currentUserName') || '',
    departmentName: searchParams.get('departmentName') || '',
    cityName: searchParams.get('cityName') || '',
    projectName: searchParams.get('projectName') || '',
    locationQuery: searchParams.get('locationQuery') || '',
    priceMin: searchParams.get('priceMin') || '',
    priceMax: searchParams.get('priceMax') || '',
    purchaseDateFrom: searchParams.get('purchaseDateFrom') || '',
    purchaseDateTo: searchParams.get('purchaseDateTo') || '',
    handoverDateFrom: searchParams.get('handoverDateFrom') || '',
    handoverDateTo: searchParams.get('handoverDateTo') || '',
    supplierName: searchParams.get('supplierName') || '',
    hasSerial: searchParams.get('hasSerial') || '',
    hasDocuments: searchParams.get('hasDocuments') || '',
    level4Name: searchParams.get('level4Name') || '',
    isAssigned: searchParams.get('isAssigned') || '',
    hasPrinted: searchParams.get('hasPrinted') || '',
    isChecked: searchParams.get('isChecked') || '',
    invoiceBatchId: searchParams.get('invoiceBatchId') || '',
  };

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedAssetMap, setSelectedAssetMap] = useState<Record<number, any>>({});
  const [groupSelectionResetKey, setGroupSelectionResetKey] = useState(0);
  const [localSearch, setLocalSearch] = useState(search);

  // Compact Filters States
  const [lv4Categories, setLv4Categories] = useState<any[]>([]);
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [showAssetControls, setShowAssetControls] = useState(false);
  const [assetViewMode, setAssetViewMode] = useState<'table' | 'grouped' | 'location'>('table');
  const [openTableFilterKey, setOpenTableFilterKey] = useState<string | null>(null);
  const [tableColumnFilters, setTableColumnFilters] = useState<Record<string, string[]>>({});
  const [tableFilterAssets, setTableFilterAssets] = useState<any[]>([]);
  const [tableFilterDatasetKey, setTableFilterDatasetKey] = useState<string | null>(null);
  const [tableFilterEnabled, setTableFilterEnabled] = useState(false);
  const [tableFilterLoading, setTableFilterLoading] = useState(false);
  const tableFilterRequestSeq = useRef(0);

  // Sync temporary states with URL filters
  const [tempStatus, setTempStatus] = useState<string[]>([]);
  const [tempUserName, setTempUserName] = useState('');
  const [tempDeptName, setTempDeptName] = useState('');
  const [tempAllocation, setTempAllocation] = useState(''); // '', 'ASSIGNED', 'UNASSIGNED'
  const [tempHandoverFrom, setTempHandoverFrom] = useState('');
  const [tempHandoverTo, setTempHandoverTo] = useState('');

  const [tempCity, setTempCity] = useState('');
  const [tempProject, setTempProject] = useState('');
  const [tempLocation, setTempLocation] = useState('');

  const [tempLv4Name, setTempLv4Name] = useState<string[]>([]);
  const [lv4Search, setLv4Search] = useState('');

  // Drawer advanced filters
  const [tempCompanyCode, setTempCompanyCode] = useState('');
  const [isNormalizationOpen, setIsNormalizationOpen] = useState(false);
  const [isAssetReportOpen, setIsAssetReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPreview, setReportPreview] = useState<any>(null);
  const [reportForm, setReportForm] = useState({
    reportType: 'summary',
    selectedDate: new Date().toISOString().slice(0, 10),
    compareMode: 'current',
    status: '',
    companyCode: '',
    departmentName: '',
    cityName: '',
    projectName: '',
    locationQuery: '',
    level4Code: '',
    currentUserName: ''
  });
  const [reportOptions, setReportOptions] = useState<{
    companies: Array<{ value: string; label: string }>;
    departments: string[];
    cities: string[];
    projects: string[];
    locations: string[];
    users: string[];
  }>({ companies: [], departments: [], cities: [], projects: [], locations: [], users: [] });
  const [reportOptionsLoading, setReportOptionsLoading] = useState(false);
  const [tempPriceMin, setTempPriceMin] = useState('');
  const [tempPriceMax, setTempPriceMax] = useState('');
  const [tempPurchaseFrom, setTempPurchaseFrom] = useState('');
  const [tempPurchaseTo, setTempPurchaseTo] = useState('');
  const [tempSupplierName, setTempSupplierName] = useState('');
  const [tempHasSerial, setTempHasSerial] = useState('');
  const [tempHasDocuments, setTempHasDocuments] = useState('');
  const [tempHasPrinted, setTempHasPrinted] = useState('');
  const [tempIsChecked, setTempIsChecked] = useState('');
  const [tempSortBy, setTempSortBy] = useState(sortBy);
  const [tempSortOrder, setTempSortOrder] = useState(sortOrder);

  const [filterInvoiceNo, setFilterInvoiceNo] = useState<string>('');

  useEffect(() => {
    const fetchLv4Categories = async () => {
      try {
        const res = await api.get('/assets/categories/active/all');
        const lv4 = res.data.filter((c: any) => c.level === 4);
        setLv4Categories(lv4);
      } catch (err) {
        console.error("Failed to fetch categories", err);
      }
    };
    fetchLv4Categories();
  }, []);

  useEffect(() => {
    if (!isAssetReportOpen) return;

    let cancelled = false;
    const loadReportOptions = async () => {
      setReportOptionsLoading(true);
      try {
        const [companies, departments, cities, projects, locations, users] = await Promise.all([
          api.get('/assets/filter-options/companies'),
          api.get('/assets/filter-options/departments', { params: { q: '', limit: 1000 } }),
          api.get('/assets/filter-options/cities', { params: { q: '', limit: 1000 } }),
          api.get('/assets/filter-options/projects', { params: { q: '', limit: 1000 } }),
          api.get('/assets/filter-options/locations', { params: { q: '', limit: 1000 } }),
          api.get('/assets/filter-options/users', { params: { q: '', limit: 1000 } }),
        ]);
        if (!cancelled) {
          setReportOptions({
            companies: companies.data || [],
            departments: departments.data || [],
            cities: cities.data || [],
            projects: projects.data || [],
            locations: locations.data || [],
            users: users.data || [],
          });
        }
      } catch (err) {
        console.error('Không thể tải danh sách bộ lọc báo cáo', err);
        if (!cancelled) toast.error('Không thể tải danh sách bộ lọc báo cáo.');
      } finally {
        if (!cancelled) setReportOptionsLoading(false);
      }
    };
    loadReportOptions();
    return () => { cancelled = true; };
  }, [isAssetReportOpen]);

  useEffect(() => {
    if (filters.invoiceBatchId) {
      api.get(`/assets/invoices/${filters.invoiceBatchId}`)
        .then(res => setFilterInvoiceNo(res.data.invoiceNo))
        .catch(() => setFilterInvoiceNo(`ID: ${filters.invoiceBatchId}`));
    } else {
      setFilterInvoiceNo('');
    }
  }, [filters.invoiceBatchId]);

  useEffect(() => {
    setTempStatus(filters.status ? filters.status.split(',') : []);
    setTempUserName(filters.currentUserName || '');
    setTempDeptName(filters.departmentName || '');
    setTempAllocation(filters.isAssigned === 'true' ? 'ASSIGNED' : filters.isAssigned === 'false' ? 'UNASSIGNED' : '');
    setTempHandoverFrom(filters.handoverDateFrom || '');
    setTempHandoverTo(filters.handoverDateTo || '');

    setTempCity(filters.cityName || '');
    setTempProject(filters.projectName || '');
    setTempLocation(filters.locationQuery || '');

    setTempLv4Name(filters.level4Name ? filters.level4Name.split(',') : []);

    setTempCompanyCode(filters.companyCode || '');
    setTempPriceMin(filters.priceMin || '');
    setTempPriceMax(filters.priceMax || '');
    setTempPurchaseFrom(filters.purchaseDateFrom || '');
    setTempPurchaseTo(filters.purchaseDateTo || '');
    setTempSupplierName(filters.supplierName || '');
    setTempHasSerial(filters.hasSerial || '');
    setTempHasDocuments(filters.hasDocuments || '');
    setTempHasPrinted(filters.hasPrinted || '');
    setTempIsChecked(filters.isChecked || '');
    setTempSortBy(sortBy);
    setTempSortOrder(sortOrder);
  }, [searchParams]);

  const applyStatusFilter = () => {
    updateParam('status', tempStatus.join(','));
  };

  const clearStatusFilter = () => {
    setTempStatus([]);
    updateParam('status', null);
  };

  const applyAllocationFilter = () => {
    const newParams = new URLSearchParams(searchParams);
    if (tempUserName) newParams.set('currentUserName', tempUserName);
    else newParams.delete('currentUserName');

    if (tempDeptName) newParams.set('departmentName', tempDeptName);
    else newParams.delete('departmentName');

    if (tempAllocation === 'ASSIGNED') newParams.set('isAssigned', 'true');
    else if (tempAllocation === 'UNASSIGNED') newParams.set('isAssigned', 'false');
    else newParams.delete('isAssigned');

    if (tempHandoverFrom) newParams.set('handoverDateFrom', tempHandoverFrom);
    else newParams.delete('handoverDateFrom');

    if (tempHandoverTo) newParams.set('handoverDateTo', tempHandoverTo);
    else newParams.delete('handoverDateTo');

    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const clearAllocationFilter = () => {
    setTempUserName('');
    setTempDeptName('');
    setTempAllocation('');
    setTempHandoverFrom('');
    setTempHandoverTo('');
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('currentUserName');
    newParams.delete('departmentName');
    newParams.delete('isAssigned');
    newParams.delete('handoverDateFrom');
    newParams.delete('handoverDateTo');
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const applyLocationFilter = () => {
    const newParams = new URLSearchParams(searchParams);
    if (tempCity) newParams.set('cityName', tempCity);
    else newParams.delete('cityName');

    if (tempProject) newParams.set('projectName', tempProject);
    else newParams.delete('projectName');

    if (tempLocation) newParams.set('locationQuery', tempLocation);
    else newParams.delete('locationQuery');

    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const clearLocationFilter = () => {
    setTempCity('');
    setTempProject('');
    setTempLocation('');
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('cityName');
    newParams.delete('projectName');
    newParams.delete('locationQuery');
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const applyLv4Filter = () => {
    updateParam('level4Name', tempLv4Name.join(','));
  };

  const clearLv4Filter = () => {
    setTempLv4Name([]);
    updateParam('level4Name', null);
  };

  const applyAdvancedFilters = () => {
    const newParams = new URLSearchParams(searchParams);
    if (tempStatus.length) newParams.set('status', tempStatus.join(','));
    else newParams.delete('status');

    if (tempUserName) newParams.set('currentUserName', tempUserName);
    else newParams.delete('currentUserName');

    if (tempDeptName) newParams.set('departmentName', tempDeptName);
    else newParams.delete('departmentName');

    if (tempAllocation === 'ASSIGNED') newParams.set('isAssigned', 'true');
    else if (tempAllocation === 'UNASSIGNED') newParams.set('isAssigned', 'false');
    else newParams.delete('isAssigned');

    if (tempHandoverFrom) newParams.set('handoverDateFrom', tempHandoverFrom);
    else newParams.delete('handoverDateFrom');

    if (tempHandoverTo) newParams.set('handoverDateTo', tempHandoverTo);
    else newParams.delete('handoverDateTo');

    if (tempCity) newParams.set('cityName', tempCity);
    else newParams.delete('cityName');

    if (tempProject) newParams.set('projectName', tempProject);
    else newParams.delete('projectName');

    if (tempLocation) newParams.set('locationQuery', tempLocation);
    else newParams.delete('locationQuery');

    if (tempLv4Name.length) newParams.set('level4Name', tempLv4Name.join(','));
    else newParams.delete('level4Name');

    if (tempCompanyCode) newParams.set('companyCode', tempCompanyCode);
    else newParams.delete('companyCode');

    if (tempPriceMin) newParams.set('priceMin', tempPriceMin);
    else newParams.delete('priceMin');

    if (tempPriceMax) newParams.set('priceMax', tempPriceMax);
    else newParams.delete('priceMax');

    if (tempPurchaseFrom) newParams.set('purchaseDateFrom', tempPurchaseFrom);
    else newParams.delete('purchaseDateFrom');

    if (tempPurchaseTo) newParams.set('purchaseDateTo', tempPurchaseTo);
    else newParams.delete('purchaseDateTo');

    if (tempSupplierName) newParams.set('supplierName', tempSupplierName);
    else newParams.delete('supplierName');

    if (tempHasSerial) newParams.set('hasSerial', tempHasSerial);
    else newParams.delete('hasSerial');

    if (tempHasDocuments) newParams.set('hasDocuments', tempHasDocuments);
    else newParams.delete('hasDocuments');

    if (tempHasPrinted) newParams.set('hasPrinted', tempHasPrinted);
    else newParams.delete('hasPrinted');

    if (tempIsChecked) newParams.set('isChecked', tempIsChecked);
    else newParams.delete('isChecked');

    if (tempSortBy) newParams.set('sortBy', tempSortBy);
    if (tempSortOrder) newParams.set('sortOrder', tempSortOrder);

    newParams.set('page', '1');
    setSearchParams(newParams);
    setIsAdvancedFilterOpen(false);
  };

  const clearAdvancedFilters = () => {
    setTempStatus([]);
    setTempUserName('');
    setTempDeptName('');
    setTempAllocation('');
    setTempHandoverFrom('');
    setTempHandoverTo('');
    setTempCity('');
    setTempProject('');
    setTempLocation('');
    setTempLv4Name([]);
    setTempCompanyCode('');
    setTempPriceMin('');
    setTempPriceMax('');
    setTempPurchaseFrom('');
    setTempPurchaseTo('');
    setTempSupplierName('');
    setTempHasSerial('');
    setTempHasDocuments('');
    setTempHasPrinted('');
    setTempIsChecked('');
    setTempSortBy('updatedAt');
    setTempSortOrder('desc');
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('status');
    newParams.delete('currentUserName');
    newParams.delete('departmentName');
    newParams.delete('isAssigned');
    newParams.delete('handoverDateFrom');
    newParams.delete('handoverDateTo');
    newParams.delete('cityName');
    newParams.delete('projectName');
    newParams.delete('locationQuery');
    newParams.delete('level4Name');
    newParams.delete('companyCode');
    newParams.delete('priceMin');
    newParams.delete('priceMax');
    newParams.delete('purchaseDateFrom');
    newParams.delete('purchaseDateTo');
    newParams.delete('supplierName');
    newParams.delete('hasSerial');
    newParams.delete('hasDocuments');
    newParams.delete('hasPrinted');
    newParams.delete('isChecked');
    newParams.delete('sortBy');
    newParams.delete('sortOrder');
    newParams.set('page', '1');
    setSearchParams(newParams);
    setIsAdvancedFilterOpen(false);
  };

  const clearAllFilters = () => {
    setLocalSearch('');
    setSearchParams({});
  };

  // Sync localSearch with search query param when it changes externally
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    if (!isAdvancedFilterOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAdvancedFilterOpen(false);
    };
    const orientationQuery = window.matchMedia('(orientation: portrait)');
    const handleOrientationChange = () => setIsAdvancedFilterOpen(false);
    window.addEventListener('keydown', handleKeyDown);
    orientationQuery.addEventListener('change', handleOrientationChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      orientationQuery.removeEventListener('change', handleOrientationChange);
    };
  }, [isAdvancedFilterOpen]);

  // Debounce updating the search URL parameter to prevent focus loss & IME breaks
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        updateParam('search', localSearch);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localSearch, search]);

  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isAssetActionMenuOpen, setIsAssetActionMenuOpen] = useState(false);

  const updateParam = (key: string, value: string | null) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === null || value === '') {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    if (key !== 'page') newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const fetchAssets = useCallback(async () => {
    const requestId = ++assetRequestSeq.current;
    setLoading(true);
    try {
      const params = Object.fromEntries(searchParams.entries());
      delete params.page;
      delete params.limit;
      params.all = 'true';
      params.compact = 'table';
      const res = await api.get('/assets', { params });
      if (requestId !== assetRequestSeq.current) return;
      setAssets(res.data.assets);
      setTotal(res.data.pagination.total);
    } catch (err) {
      if (requestId !== assetRequestSeq.current) return;
      console.error(err);
      toast.error("Lỗi khi tải danh sách tài sản");
    } finally {
      if (requestId === assetRequestSeq.current) setLoading(false);
    }
  }, [searchParams]);

  const fetchStats = useCallback(async () => {
    try {
      const params = Object.fromEntries(searchParams.entries());
      const res = await api.get('/assets/stats', { params });
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [searchParams]);

  const tableFilterQueryKey = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('page');
    params.delete('limit');
    params.delete('sortBy');
    params.delete('sortOrder');
    return params.toString();
  }, [searchParams]);

  const fetchTableFilterAssets = useCallback(async (force = false) => {
    if (!tableFilterEnabled || (!force && tableFilterDatasetKey !== null && tableFilterDatasetKey === tableFilterQueryKey)) return;
    const requestId = ++tableFilterRequestSeq.current;
    setTableFilterLoading(true);
    try {
      const params = Object.fromEntries(searchParams.entries());
      delete params.page;
      params.limit = String(GROUPED_VIEW_FETCH_LIMIT);
      params.sortBy = sortBy;
      params.sortOrder = sortOrder;
      params.compact = 'grouped';
      params.skipCount = 'true';
      const res = await api.get('/assets', { params });
      if (requestId !== tableFilterRequestSeq.current) return;
      setTableFilterAssets(res.data.assets || []);
      setTableFilterDatasetKey(tableFilterQueryKey);
    } catch (err) {
      if (requestId !== tableFilterRequestSeq.current) return;
      console.error(err);
      toast.error('Không thể tải đầy đủ dữ liệu cho bộ lọc cột');
    } finally {
      if (requestId === tableFilterRequestSeq.current) setTableFilterLoading(false);
    }
  }, [searchParams, sortBy, sortOrder, tableFilterDatasetKey, tableFilterEnabled, tableFilterQueryKey]);

  const fetchGroupedViewAssets = useCallback(async () => {
    if (assetViewMode === 'table') return;
    const requestId = ++groupedRequestSeq.current;
    setGroupedViewLoading(true);
    try {
      const params = Object.fromEntries(searchParams.entries());
      delete params.page;
      params.limit = String(GROUPED_VIEW_FETCH_LIMIT);
      params.sortBy = 'assetCode';
      params.sortOrder = 'asc';
      params.compact = 'grouped';
      params.skipCount = 'true';
      const res = await api.get('/assets', { params });
      if (requestId !== groupedRequestSeq.current) return;
      setGroupedViewAssets(res.data.assets || []);
    } catch (err) {
      if (requestId !== groupedRequestSeq.current) return;
      console.error(err);
      toast.error("Không thể tải dữ liệu view tài sản");
    } finally {
      if (requestId === groupedRequestSeq.current) setGroupedViewLoading(false);
    }
  }, [assetViewMode, searchParams]);

  const refreshAssetData = useCallback(async () => {
    await Promise.all([
      fetchAssets(),
      fetchStats(),
      fetchGroupedViewAssets(),
      fetchTableFilterAssets(true)
    ]);
  }, [fetchAssets, fetchStats, fetchGroupedViewAssets, fetchTableFilterAssets]);

  const resetAllAssetSelections = useCallback(() => {
    setSelectedIds([]);
    setSelectedAssetMap({});
    setGroupSelectionResetKey((current) => current + 1);
  }, []);

  const completeGroupedAction = useCallback(() => {
    resetAllAssetSelections();
    void refreshAssetData();
  }, [refreshAssetData, resetAllAssetSelections]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchGroupedViewAssets();
  }, [fetchGroupedViewAssets]);

  useEffect(() => {
    fetchTableFilterAssets();
  }, [fetchTableFilterAssets]);

  useEffect(() => {
    setTableColumnFilters({});
  }, [tableFilterQueryKey]);

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectedAssetMap({});
  };

  const toggleAssetSelection = (asset: any) => {
    setSelectedIds(prev => {
      if (prev.includes(asset.id)) return prev.filter(id => id !== asset.id);
      return [...prev, asset.id];
    });
    setSelectedAssetMap(prev => {
      if (prev[asset.id]) {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      }
      return { ...prev, [asset.id]: asset };
    });
  };

  const getStatusLabel = (status: string) => {
    const statusConfig = getAssetStatusConfig(status);
    return { label: statusConfig.label, color: statusConfig.tone, icon: statusConfig.icon };
  };

  const formatDateShort = (value?: string | Date | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('vi-VN');
  };

  const getRecoveryAlert = (asset: any) => {
    if (!asset.offboardingAlert || asset.offboardingResolvedAt || !asset.expectedRecoveryDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(asset.expectedRecoveryDate);
    dueDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);
    const employee = asset.offboardingEmployeeName || asset.currentUserName || 'Nhân sự nghỉ việc';
    const offboardingDate = formatDateShort(asset.offboardingDate);

    if (diffDays < 0) {
      return {
        label: `QUÁ HẠN THU HỒI ${Math.abs(diffDays)} NGÀY`,
        detail: `${employee}${offboardingDate ? ` nghỉ việc ${offboardingDate}` : ''}`,
        className: 'bg-red-700 text-white border-red-800'
      };
    }
    if (diffDays === 0) {
      return {
        label: 'CẦN THU HỒI',
        detail: `${employee}${offboardingDate ? ` nghỉ việc ${offboardingDate}` : ''}`,
        className: 'bg-red-50 text-red-700 border-red-200'
      };
    }
    if (diffDays <= 3) {
      return {
        label: `SẮP THU HỒI ${formatDateShort(asset.expectedRecoveryDate)}`,
        detail: `${employee}${offboardingDate ? ` nghỉ việc ${offboardingDate}` : ''}`,
        className: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    }
    return null;
  };

  const getMissingAssetFields = (asset: any) => {
    const missing: string[] = [];
    const isEmpty = (value: any) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      return !normalized || normalized === 'n/a' || normalized === 'na' || normalized === '-';
    };

    if (isEmpty(asset.serialNumber)) missing.push('Serial');
    if (isEmpty(asset.cityName)) missing.push('Thành phố');
    if (isEmpty(asset.locationName)) missing.push('Vị trí');
    if (asset.status === 'ASSIGNED' && isEmpty(asset.currentUserName) && !asset.assignedAreaName) missing.push('Người dùng / Khu vực');
    if (asset.status === 'ASSIGNED' && isEmpty(asset.departmentName)) missing.push('Phòng ban');
    return missing;
  };

  const cleanLocationName = (
    cityName?: string,
    locationName?: string,
    projectName?: string,
    departmentName?: string
  ) => {
    const city = String(cityName || '').trim();
    const project = String(projectName || '').trim();
    const department = String(departmentName || '').trim();
    let location = String(locationName || '').trim();
    location = location
      .replace(/Văn phòng Hà Nội/gi, 'Văn phòng C6')
      .replace(/Khối\s+II\b/gi, 'C6-II')
      .replace(/Khối\s+I\b/gi, 'C6-I');
    location = location
      .replace(/\b([A-Za-z]+\d+)\s*-\s*([IVXLCDM]+|\d+)(?=$|[\s,.;)\-])/gi, '$1§$2')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/§/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

    const normalizedCity = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normalizedLocation = location.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const compactLocation = normalizedLocation.replace(/[-/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
    const riversideOfficeAliases = [
      'danko riverside',
      'van phong ban hang danko riverside',
      'van phong bac ninh',
      'bac ninh danko riverside van phong ban hang'
    ];

    if (riversideOfficeAliases.includes(compactLocation)) {
      return 'Bắc Ninh - Danko Riverside - Văn phòng Bán hàng';
    }

    const normalizedProject = project.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const normalizedDepartment = department.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const centerDepartmentLocations: Record<string, string> = {
      'b. cay xanh': 'B. Cây Xanh',
      'ban cay xanh': 'B. Cây Xanh',
      'bqlda dkt': 'Ban Quản lý Dự án',
      'ban quan ly du an': 'Ban Quản lý Dự án',
      'kinh doanh': 'B. Kinh doanh',
      'b. kinh doanh': 'B. Kinh doanh',
      'van phong ban hang kim phu': 'Văn phòng bán hàng',
      'vpbh dkt': 'Văn phòng bán hàng',
      'van phong ban hang': 'Văn phòng bán hàng'
    };
    const centerDepartmentLocation = centerDepartmentLocations[normalizedDepartment];
    const belongsToCenter = normalizedCity === 'tuyen quang'
      || normalizedProject === 'danko center'
      || compactLocation === 'danko center'
      || ['bqlda dkt', 'van phong ban hang kim phu', 'vpbh dkt'].includes(normalizedDepartment);
    const isGenericCenterLocation = !compactLocation
      || compactLocation === 'danko center'
      || compactLocation === 'tuyen quang danko center van phong ban hang';

    if (belongsToCenter && centerDepartmentLocation && isGenericCenterLocation) {
      return `Tuyên Quang - Danko Center - ${centerDepartmentLocation}`;
    }
    if (compactLocation === 'danko center' || compactLocation === 'tuyen quang danko center van phong ban hang') {
      return 'Tuyên Quang - Danko Center - Văn phòng bán hàng';
    }

    const alreadyHasCity = /^ha noi(?:\s*-\s*|\s*\/\s*|$)/.test(normalizedLocation);

    if (normalizedCity === 'ha noi' && !alreadyHasCity) {
      location = location.replace(/^Văn phòng C6\s*(?:-\s*|\/\s*)?/i, '').trim();
      return location
        ? `Hà Nội - Văn phòng C6 - ${location}`
        : 'Hà Nội - Văn phòng C6';
    }
    return location;
  };

  const isNonStandardLocation = (asset: any) => {
    const location = String(asset.locationName || '').trim();
    return cleanLocationName(
      asset.cityName,
      asset.locationName,
      asset.projectName,
      asset.departmentName
    ) !== location;
  };

  const getLocationIssues = (asset: any) => {
    const issues: string[] = [];
    if (isNonStandardLocation(asset)) issues.push('Vị trí chưa đúng chuẩn Hà Nội - Văn phòng C6');
    return issues;
  };

  const handleNormalizeSelectedLocations = async () => {
    const targets = selectedAssets.filter(isNonStandardLocation);
    if (targets.length === 0) {
      toast.info('Không có tài sản đang chọn bị sai form vị trí.');
      return;
    }

    if (!window.confirm(`Chuẩn hóa vị trí cho ${targets.length} tài sản đang chọn?`)) return;

    try {
      await Promise.all(targets.map((asset: any) => api.patch(`/assets/${asset.id}/assignment-info`, {
        currentUserName: asset.currentUserName || null,
        currentPosition: asset.currentPosition || null,
        departmentName: asset.departmentName || null,
        cityName: asset.cityName || null,
        locationName: cleanLocationName(
          asset.cityName,
          asset.locationName,
          asset.projectName,
          asset.departmentName
        ) || null,
        reason: 'Chuẩn hóa nhanh form Thành phố/Dự án/Vị trí từ Sổ tài sản'
      })));
      toast.success(`Đã chuẩn hóa vị trí cho ${targets.length} tài sản`);
      clearSelection();
      refreshAssetData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể chuẩn hóa vị trí hàng loạt');
    }
  };

  const handleBulkOffboardingAlert = async () => {
    const defaultEmployee = selectedAssets.find((asset: any) => asset.currentUserName)?.currentUserName || '';
    const employeeName = window.prompt('Nhân sự nghỉ việc:', defaultEmployee);
    if (!employeeName?.trim()) {
      toast.error('Bắt buộc nhập nhân sự nghỉ việc.');
      return;
    }

    const todayText = new Date().toISOString().slice(0, 10);
    const offboardingDate = window.prompt('Ngày nghỉ việc (yyyy-mm-dd):', todayText);
    if (!offboardingDate?.trim()) {
      toast.error('Bắt buộc nhập ngày nghỉ việc.');
      return;
    }

    const expectedRecoveryDate = window.prompt('Ngày cần thu tài sản (yyyy-mm-dd):', offboardingDate);
    if (!expectedRecoveryDate?.trim()) {
      toast.error('Bắt buộc nhập ngày cần thu tài sản.');
      return;
    }

    const note = window.prompt('Ghi chú (không bắt buộc):', '') || '';
    if (!window.confirm(`Tạo cảnh báo thu hồi cho toàn bộ tài sản đang gán cho "${employeeName.trim()}"?`)) return;

    try {
      const res = await api.post('/assets/offboarding-alert', {
        employeeName: employeeName.trim(),
        offboardingDate,
        expectedRecoveryDate,
        note
      });
      toast.success(res.data?.message || 'Đã tạo cảnh báo thu hồi tài sản nghỉ việc.');
      clearSelection();
      refreshAssetData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tạo cảnh báo tài sản nghỉ việc.');
    }
  };

  const recoverOffboardingAsset = async (asset: any) => {
    if (!window.confirm(`Thu hồi tài sản ${asset.assetCode} về kho và đóng cảnh báo nghỉ việc?`)) return;
    const note = window.prompt('Ghi chú thu hồi:', 'Thu hồi tài sản do nhân sự nghỉ việc') || '';
    try {
      await api.patch(`/assets/${asset.id}/offboarding-alert/recover`, { note });
      toast.success('Đã thu hồi tài sản và đóng cảnh báo.');
      refreshAssetData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể thu hồi tài sản.');
    }
  };

  const extendOffboardingAsset = async (asset: any) => {
    const defaultDate = asset.expectedRecoveryDate ? new Date(asset.expectedRecoveryDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const expectedRecoveryDate = window.prompt('Ngày cần thu tài sản mới (yyyy-mm-dd):', defaultDate);
    if (!expectedRecoveryDate?.trim()) {
      toast.error('Bắt buộc nhập ngày cần thu tài sản.');
      return;
    }
    const note = window.prompt('Lý do gia hạn (không bắt buộc):', '') || '';
    try {
      await api.patch(`/assets/${asset.id}/offboarding-alert/extend`, { expectedRecoveryDate, note });
      toast.success('Đã gia hạn ngày thu tài sản.');
      refreshAssetData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể gia hạn ngày thu.');
    }
  };

  const resolveOffboardingAsset = async (asset: any) => {
    const note = window.prompt('Ghi chú xử lý:', 'Đã xử lý cảnh báo nghỉ việc') || '';
    try {
      await api.patch(`/assets/${asset.id}/offboarding-alert/resolve`, { note });
      toast.success('Đã đánh dấu cảnh báo là đã xử lý.');
      refreshAssetData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể đánh dấu đã xử lý.');
    }
  };

  const clearOffboardingAsset = async (asset: any) => {
    if (!window.confirm(`Bỏ cảnh báo nghỉ việc khỏi tài sản ${asset.assetCode}?`)) return;
    const note = window.prompt('Lý do bỏ cảnh báo:', 'Bỏ cảnh báo nghỉ việc') || '';
    try {
      await api.patch(`/assets/${asset.id}/offboarding-alert/clear`, { note });
      toast.success('Đã bỏ cảnh báo nghỉ việc.');
      refreshAssetData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể bỏ cảnh báo.');
    }
  };

  const openAssetDetail = (assetId: number, tab: string = 'info') => {
    const asset = assets.find(a => a.id === assetId)
      || tableFilterAssets.find(a => a.id === assetId)
      || groupedViewAssets.find(a => a.id === assetId);
    if (!asset) return;

    let targetTab = tab;
    if (tab === 'status_auto') {
      switch (asset.status) {
        case 'UNDER_REPAIR':
        case 'DAMAGED':
          targetTab = 'repair';
          break;
        case 'LOST':
          targetTab = 'timeline';
          break;
        case 'IN_STOCK':
          targetTab = 'info';
          break;
        default:
          targetTab = 'info';
      }
    }

    openModal("ASSET_DETAIL", {
      assetId,
      initialTab: targetTab,
      onAction: (action: string, id: number) => {
        if (action === 'refresh') {
          refreshAssetData();
        } else {
          const targetAsset = assets.find(a => a.id === id)
            || tableFilterAssets.find(a => a.id === id)
            || groupedViewAssets.find(a => a.id === id);
          if (targetAsset) handleAssetAction(action, targetAsset);
        }
      }
    });
  };

  const completeAssetRepair = async (asset: any) => {
    const ticket = asset.repairTickets?.[0];
    if (!ticket) {
      toast.error('Tài sản không có phiếu sửa chữa đang mở.');
      return;
    }
    if (!window.confirm(`Xác nhận tài sản ${asset.assetCode} đã sửa xong?`)) return;

    try {
      await api.post(`/repairs/${ticket.id}/complete`, {
        actualFinishDate: new Date().toISOString().slice(0, 10),
        result: 'Đã sửa xong'
      });
      toast.success('Đã hoàn tất sửa chữa và cập nhật trạng thái tài sản.');
      await refreshAssetData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể hoàn tất sửa chữa.');
    }
  };

  const handleAssetAction = (action: string, asset: any) => {
    setActiveMenuId(null);
    switch (action) {
      case 'view':
        openAssetDetail(asset.id, 'info');
        break;
      case 'handover':
        openModal("TRANSFER_WIZARD", {
          initialAssetIds: [asset.id],
          defaultType: asset.status === 'IN_STOCK' ? 'HANDOVER' : 'TRANSFER',
          source: 'ASSET_DETAIL',
          onComplete: completeGroupedAction
        });
        break;
      case 'revoke':
        openModal("TRANSFER_WIZARD", {
          initialAssetIds: [asset.id],
          defaultType: 'RECALL',
          source: 'ASSET_DETAIL',
          onComplete: completeGroupedAction
        });
        break;
      case 'location_transfer':
        openModal("TRANSFER_WIZARD", {
          initialAssetIds: [asset.id],
          defaultType: 'LOCATION_TRANSFER',
          source: 'ASSET_DETAIL',
          onComplete: completeGroupedAction
        });
        break;
      case 'inventory':
        openModal("INVENTORY_WIZARD", {
          initialAssetIds: [asset.id],
          onComplete: completeGroupedAction
        });
        break;
      case 'repair':
        if (asset.repairTickets && asset.repairTickets.length > 0) {
          openModal('REPAIR_PROCESSING', {
            ticketId: asset.repairTickets[0].id,
            onSuccess: completeGroupedAction
          });
          break;
        }
        openModal("BM_FORM", {
          code: 'BM03/QLTS',
          data: { asset },
          onSubmit: completeGroupedAction
        });
        break;
      case 'repair_complete':
        void completeAssetRepair(asset);
        break;
      case 'liquidation':
        openModal("BM_FORM", {
          code: 'BM04/QLTS',
          data: { asset },
          onSubmit: completeGroupedAction
        });
        break;
      case 'print_label':
        if (!asset) {
          toast.error('Không tìm thấy dữ liệu tài sản.');
          break;
        }
        const assetCode = asset.asset_code || asset.assetCode || asset.code;
        if (!assetCode) {
          toast.error('Tài sản chưa có mã, không thể in tem.');
          break;
        }
        closeModal();
        navigate('/print-center', {
          state: {
            selectedAssets: [asset]
          }
        });
        resetAllAssetSelections();
        toast.success("Đã thêm tài sản vào danh sách in tem");
        break;
      case 'history':
        openAssetDetail(asset.id, 'timeline');
        break;
      case 'offboarding_recover':
        recoverOffboardingAsset(asset);
        break;
      case 'offboarding_extend':
        extendOffboardingAsset(asset);
        break;
      case 'offboarding_resolve':
        resolveOffboardingAsset(asset);
        break;
      case 'offboarding_clear':
        clearOffboardingAsset(asset);
        break;
      default:
        break;
    }
  };

  const handleBulkPrint = () => {
    const currentPageMap = new Map(assets.map(asset => [asset.id, asset]));
    const selectedAssetsForPrint = selectedIds
      .map(id => selectedAssetMap[id] || currentPageMap.get(id))
      .filter(Boolean);
    if (selectedAssetsForPrint.length === 0) return;
    navigate('/print-center', {
      state: {
        selectedAssets: selectedAssetsForPrint
      }
    });
    clearSelection();
    toast.success(`Đã thêm ${selectedAssetsForPrint.length} tài sản vào danh sách in tem`);
  };

  const downloadBlobResponse = async (response: any, fallbackFileName: string) => {
    const contentType = String(response.headers?.['content-type'] || '');
    if (contentType.includes('application/json')) {
      const text = await response.data.text();
      const parsed = JSON.parse(text);
      throw new Error(parsed.message || 'Không thể xuất báo cáo');
    }

    const disposition = String(response.headers?.['content-disposition'] || '');
    const matchedFileName = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)?.[1];
    const fileName = matchedFileName ? decodeURIComponent(matchedFileName.replace(/"/g, '')) : fallbackFileName;
    const blob = new Blob([response.data], { type: contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const getExportErrorMessage = async (err: any, fallback: string) => {
    const data = err?.response?.data;
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        if (text) {
          const parsed = JSON.parse(text);
          return parsed.message || fallback;
        }
      } catch {
        return fallback;
      }
    }
    return err?.response?.data?.message || err?.message || fallback;
  };

  const handleExportAll = async () => {
    try {
      const params = Object.fromEntries(searchParams.entries());
      delete params.page;
      delete params.limit;
      const response = await api.get('/assets/export-excel', { params, responseType: 'blob' });
      await downloadBlobResponse(response, `so_tai_san_snapshot_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Tải snapshot sổ tài sản thành công!");
    } catch (err: any) {
      console.error(err);
      toast.error(await getExportErrorMessage(err, "Lỗi khi tải snapshot sổ tài sản"));
    }
  };

  const handleExportExcel = async () => {
    try {
      const params = Object.fromEntries(searchParams.entries());
      delete params.page;
      delete params.limit;
      const response = await api.get('/assets/export-excel', { params, responseType: 'blob' });
      await downloadBlobResponse(response, `so_tai_san_snapshot_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Tải báo cáo sổ tài sản (snapshot) thành công!");
    } catch (err: any) {
      console.error(err);
      toast.error(await getExportErrorMessage(err, "Lỗi khi tải báo cáo sổ tài sản"));
    }
  };

  const buildReportParams = () => {
    const params: Record<string, string> = {
      reportType: reportForm.reportType,
      selectedDate: reportForm.selectedDate,
      compareMode: reportForm.compareMode
    };
    Object.entries(reportForm).forEach(([key, value]) => {
      if (['reportType', 'selectedDate', 'compareMode'].includes(key)) return;
      if (value) params[key] = value;
    });
    return params;
  };

  const handlePreviewAssetReport = async () => {
    setReportLoading(true);
    try {
      const res = await api.get('/assets/stats', { params: buildReportParams() });
      setReportPreview(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Không thể xem báo cáo tài sản");
    } finally {
      setReportLoading(false);
    }
  };

  const handleExportAssetReport = async () => {
    setReportLoading(true);
    try {
      const response = await api.get('/assets/export-excel', {
        params: buildReportParams(),
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `bao_cao_tai_san_${reportForm.selectedDate}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Xuất báo cáo tài sản thành công!");
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi xuất báo cáo tài sản");
    } finally {
      setReportLoading(false);
    }
  };

  const handleExportSelected = () => {
    if (selectedAssets.length === 0) return;
    
    const headers = [
      'Mã tài sản',
      'Số TT',
      'Mã công ty',
      'Tên tài sản',
      'Số Serial',
      'ĐVT',
      'Mục đích',
      'Trạng thái',
      'Người sử dụng',
      'Chức vụ',
      'Phòng ban',
      'Vị trí',
      'Thành phố',
      'Dự án',
      ...(hasPermission('ASSET_VIEW_PRICE') ? ['Giá mua (VNĐ)'] : []),
      'Nhà cung cấp',
      'Ghi chú'
    ];

    const rows = selectedAssets.map(a => [
      a.assetCode || '',
      a.runningNoText || '',
      a.companyCode || '',
      a.assetName || '',
      a.serialNumber || '',
      a.unit || 'Cái',
      a.usagePurpose || '',
      getStatusLabel(a.status).label,
      a.currentUserName || '',
      a.currentPosition || '',
      a.departmentName || '',
      a.locationName || '',
      a.cityName || '',
      a.projectName || '',
      ...(hasPermission('ASSET_VIEW_PRICE') ? [a.purchasePriceExVat || 0] : []),
      a.supplierName || '',
      a.note || ''
    ]);

    const csvContent = '\uFEFF' + [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `danh_sach_tai_san_chon_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Xuất dữ liệu Excel tài sản được chọn thành công!");
  };

  const exportGroupedAssetsReport = async (targetAssets: any[]) => {
    try {
      const commonLevel4 = targetAssets.every((asset) => asset.level4Name === targetAssets[0]?.level4Name)
        ? targetAssets[0]?.level4Name
        : '';
      const commonLocation = targetAssets.every((asset) => asset.locationName === targetAssets[0]?.locationName)
        ? targetAssets[0]?.locationName
        : '';
      const reportName = commonLevel4 || commonLocation || `Nhóm ${targetAssets[0]?.assetCode || 'tài sản'}`;
      toast.info(`Đang tạo báo cáo Excel cho ${targetAssets.length.toLocaleString('vi-VN')} tài sản...`);
      const response = await api.post('/assets/group-report', {
        assetIds: targetAssets.map((asset) => asset.id),
        reportName
      }, {
        responseType: 'blob'
      });
      await downloadBlobResponse(
        response,
        `bao_cao_nhom_tai_san_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      toast.success('Đã tải báo cáo nhóm gồm Dashboard, chi tiết và lịch sử bàn giao.');
      resetAllAssetSelections();
    } catch (err: any) {
      console.error(err);
      toast.error(await getExportErrorMessage(err, 'Không thể xuất báo cáo Excel của nhóm.'));
    }
  };

  const handleGroupedAssetsAction = (action: string, targetAssets: any[]) => {
    const actionAssets = targetAssets.filter(Boolean);
    if (actionAssets.length === 0) return;
    const actionAssetIds = actionAssets.map((asset: any) => asset.id).filter(Boolean);

    switch (action) {
      case 'print_label':
        navigate('/print-center', {
          state: {
            selectedAssets: actionAssets
          }
        });
        toast.success(`Đã thêm ${actionAssets.length} tài sản vào danh sách in tem`);
        resetAllAssetSelections();
        break;
      case 'handover':
        openModal("TRANSFER_WIZARD", {
          initialAssetIds: actionAssetIds,
          defaultType: actionAssets.every((asset: any) => asset.status === 'IN_STOCK') ? 'HANDOVER' : 'TRANSFER',
          source: 'ASSET_DETAIL',
          onComplete: completeGroupedAction
        });
        break;
      case 'revoke':
        openModal("TRANSFER_WIZARD", {
          initialAssetIds: actionAssetIds,
          defaultType: 'RECALL',
          source: 'ASSET_DETAIL',
          onComplete: completeGroupedAction
        });
        break;
      case 'location_transfer':
        openModal("TRANSFER_WIZARD", {
          initialAssetIds: actionAssetIds,
          defaultType: 'LOCATION_TRANSFER',
          source: 'ASSET_DETAIL',
          onComplete: completeGroupedAction
        });
        break;
      case 'inventory':
        openModal("INVENTORY_WIZARD", {
          initialAssetIds: actionAssetIds,
          onComplete: completeGroupedAction
        });
        break;
      case 'repair':
        openModal("BM_FORM", {
          code: 'BM03/QLTS',
          data: {
            asset: actionAssets[0],
            assets: actionAssets
          },
          onSubmit: completeGroupedAction
        });
        break;
      case 'liquidation':
        openModal("BM_FORM", {
          code: 'BM04/QLTS',
          data: {
            asset: actionAssets[0],
            assets: actionAssets
          },
          onSubmit: completeGroupedAction
        });
        break;
      case 'export':
        void exportGroupedAssetsReport(actionAssets);
        break;
      default:
        if (actionAssets.length === 1) handleAssetAction(action, actionAssets[0]);
        break;
    }
  };

  const selectedAssetCodesText = () => selectedAssets.map((a: any) => a.assetCode).filter(Boolean).join(', ');

  const handleExportSelectedPdf = () => {
    if (selectedAssets.length === 0) return;
    const rows = selectedAssets.map((asset: any, index: number) => `
      <tr>
        <td>${index + 1}</td>
        <td>${asset.assetCode || ''}</td>
        <td>${asset.assetName || asset.assetNameShort || ''}</td>
        <td>${asset.serialNumber || ''}</td>
        <td>${asset.currentUserName || ''}</td>
        <td>${asset.departmentName || ''}</td>
        <td>${asset.cityName || ''}</td>
        <td>${cleanLocationName(asset.cityName, asset.locationName, asset.projectName, asset.departmentName) || ''}</td>
        <td>${getStatusLabel(asset.status).label}</td>
      </tr>
    `).join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Trình duyệt đang chặn cửa sổ xuất PDF.');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Báo cáo tài sản đã chọn</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { font-size: 18px; margin: 0 0 8px; text-transform: uppercase; }
            p { margin: 0 0 16px; font-size: 12px; color: #475569; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
            th { background: #f1f5f9; text-transform: uppercase; font-size: 10px; }
          </style>
        </head>
        <body>
          <h1>Báo cáo danh sách tài sản đã chọn</h1>
          <p>Số lượng: ${selectedAssets.length} tài sản • Ngày xuất: ${new Date().toLocaleString('vi-VN')}</p>
          <table>
            <thead>
              <tr>
                <th>STT</th><th>Mã tài sản</th><th>Tên tài sản</th><th>Serial</th>
                <th>Người dùng</th><th>Phòng ban</th><th>Thành phố</th><th>Vị trí</th><th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const openBulkLostForm = () => {
    const reporter = window.prompt('Người báo mất là ai?');
    if (!reporter?.trim()) {
      toast.error('Bắt buộc nhập người báo mất.');
      return;
    }
    const detectedAt = window.prompt('Thời gian phát hiện mất (dd/mm/yyyy hoặc ghi chú thời gian):', new Date().toLocaleDateString('vi-VN'));
    if (!detectedAt?.trim()) {
      toast.error('Bắt buộc nhập thời gian phát hiện mất.');
      return;
    }
    openModal("BM_FORM", {
      code: 'BM13/QLTS',
      data: {
        asset: selectedAssets[0],
        assets: selectedAssets,
        reporter,
        lostDetectedDate: detectedAt,
        note: `Ghi nhận mất hàng loạt: ${selectedAssetCodesText()}`
      },
      onSubmit: () => { clearSelection(); refreshAssetData(); }
    });
  };

  const openBulkLiquidationForm = () => {
    const reason = window.prompt('Nhập lý do thanh lý tài sản:');
    if (!reason?.trim()) {
      toast.error('Bắt buộc nhập lý do thanh lý.');
      return;
    }
    const confirmed = window.confirm(`Xác nhận thanh lý ${selectedAssets.length} tài sản?\n\n${selectedAssetCodesText()}`);
    if (!confirmed) return;
    openModal("BM_FORM", {
      code: 'BM04/QLTS',
      data: {
        asset: selectedAssets[0],
        assets: selectedAssets,
        reason,
        note: reason
      },
      onSubmit: () => { clearSelection(); refreshAssetData(); }
    });
  };

  const handleBulkCancelAssets = async () => {
    const reason = window.prompt('Nhập lý do hủy tài sản. Hành động này không thể hoàn tác trên quy trình vận hành:');
    if (!reason?.trim()) {
      toast.error('Bắt buộc nhập lý do hủy tài sản.');
      return;
    }
    const confirmed = window.confirm(`CẢNH BÁO: Hủy ${selectedAssets.length} tài sản và chuyển trạng thái sang Đã thanh lý/loại bỏ.\n\nKhông thể hoàn tác trên quy trình vận hành.\n\nDanh sách: ${selectedAssetCodesText()}\n\nTiếp tục?`);
    if (!confirmed) return;

    try {
      await Promise.all(selectedAssets.map((asset: any) => api.patch(`/assets/${asset.id}`, {
        status: 'DISPOSED',
        reason: `Hủy tài sản: ${reason}`
      })));
      toast.success(`Đã hủy ${selectedAssets.length} tài sản`);
      clearSelection();
      refreshAssetData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể hủy tài sản đã chọn');
    }
  };

  const handleBulkDeleteAssets = () => {
    const reason = window.prompt('Nhập lý do xóa/loại khỏi hệ thống:');
    if (!reason?.trim()) {
      toast.error('Bắt buộc nhập lý do xóa.');
      return;
    }
    window.alert('Chức năng xóa hàng loạt khỏi hệ thống chưa được bật để tránh mất dữ liệu. Vui lòng dùng Hủy tài sản hoặc xử lý xóa từng tài sản theo hóa đơn nếu đủ điều kiện.');
  };

  const handleSort = (columnKey: string) => {
    const newOrder = (sortBy === columnKey && sortOrder === 'asc') ? 'desc' : 'asc';
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sortBy', columnKey);
    newParams.set('sortOrder', newOrder);
    setSearchParams(newParams);
  };

  const sortableColumns = [
    { key: "assetCode", label: "Mã tài sản", className: "w-[170px]" },
    { key: "level4Name", label: "Nhóm tài sản LV4", className: "w-[190px]" },
    { key: "assetName", label: "Tên tài sản", className: "w-[280px] md:w-[320px]" },
    { key: "currentUserName", label: "Người sử dụng / Khu vực", className: "hidden xl:table-cell w-[190px]" },
    { key: "departmentName", label: "Phòng ban", className: "hidden xl:table-cell w-[160px]" },
    { key: "cityName", label: "Thành phố / Dự án / Vị trí", className: "hidden xl:table-cell w-[250px]" },
    { key: "status", label: "Trạng thái", className: "w-[150px]" },
  ];

  const getTableColumnValue = (asset: any, columnKey: string) => {
    switch (columnKey) {
      case 'assetCode':
        return String(asset.assetCode || 'Chưa có mã');
      case 'level4Name':
        return String(asset.level4Name || 'Chưa phân nhóm');
      case 'assetName':
        return String(asset.assetNameShort || asset.assetName || 'Chưa có tên');
      case 'currentUserName':
        return getAssetAssigneeDisplay(asset).name;
      case 'departmentName':
        return String(asset.departmentName || 'Chưa có phòng ban');
      case 'cityName': {
        const location = cleanLocationName(
          asset.cityName,
          asset.locationName,
          asset.projectName,
          asset.departmentName
        );
        return [asset.cityName, location].filter(Boolean).join(' - ') || 'Chưa có vị trí';
      }
      case 'status':
        return getStatusLabel(asset.status).label;
      default:
        return String(asset[columnKey] || '-');
    }
  };

  const tableFilterDataReady = tableFilterDatasetKey !== null && tableFilterDatasetKey === tableFilterQueryKey;
  const tableFilterOptionAssets = tableFilterEnabled
    ? (tableFilterDataReady ? tableFilterAssets : [])
    : assets;

  const tableFilterOptions = sortableColumns.reduce<Record<string, string[]>>((result, column) => {
    const assetsMatchingOtherFilters = tableFilterOptionAssets.filter((asset) => (
      Object.entries(tableColumnFilters).every(([filterKey, selectedValues]) => (
        filterKey === column.key || selectedValues.includes(getTableColumnValue(asset, filterKey))
      ))
    ));
    result[column.key] = Array.from(new Set(
      assetsMatchingOtherFilters.map((asset) => getTableColumnValue(asset, column.key))
    ))
      .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
    return result;
  }, {});

  const activeTableFilterCount = Object.keys(tableColumnFilters).length;
  const filteredTableAssets = (
    activeTableFilterCount > 0 && tableFilterDataReady ? tableFilterAssets : assets
  ).filter((asset) => (
    Object.entries(tableColumnFilters).every(([columnKey, selectedValues]) => (
      selectedValues.includes(getTableColumnValue(asset, columnKey))
    ))
  ));
  const sortedFilteredTableAssets = activeTableFilterCount > 0
    && sortableColumns.some((column) => column.key === sortBy)
    ? [...filteredTableAssets].sort((left, right) => {
        const comparison = getTableColumnValue(left, sortBy)
          .localeCompare(getTableColumnValue(right, sortBy), 'vi', { numeric: true });
        return sortOrder === 'asc' ? comparison : -comparison;
      })
    : filteredTableAssets;

  const filteredTableTotal = activeTableFilterCount > 0 ? sortedFilteredTableAssets.length : total;
  const visibleTableAssets = sortedFilteredTableAssets;
  const currentPageAssetIds = visibleTableAssets.map((asset) => asset.id);
  const isCurrentPageFullySelected = visibleTableAssets.length > 0 && currentPageAssetIds.every(id => selectedIds.includes(id));
  const isCurrentPagePartiallySelected = visibleTableAssets.length > 0
    && currentPageAssetIds.some(id => selectedIds.includes(id))
    && !isCurrentPageFullySelected;

  const updateTableColumnFilter = (columnKey: string, selectedValues: string[]) => {
    const allValues = tableFilterOptions[columnKey] || [];
    setTableColumnFilters((previous) => {
      const next = { ...previous };
      if (selectedValues.length === allValues.length && selectedValues.every((value) => allValues.includes(value))) {
        delete next[columnKey];
      } else {
        next[columnKey] = selectedValues;
      }
      return next;
    });
  };

  const clearTableColumnFilters = () => {
    setTableColumnFilters({});
    setOpenTableFilterKey(null);
  };

  const toggleTableFilterMenu = (columnKey: string) => {
    if (openTableFilterKey === columnKey) {
      setOpenTableFilterKey(null);
      return;
    }
    setTableFilterEnabled(true);
    setOpenTableFilterKey(columnKey);
    if (tableFilterEnabled && !tableFilterDataReady && !tableFilterLoading) {
      fetchTableFilterAssets();
    }
  };

  const toggleSelectAll = () => {
    if (isCurrentPageFullySelected) {
      const pageIdSet = new Set(currentPageAssetIds);
      setSelectedIds(prev => prev.filter(id => !pageIdSet.has(id)));
      setSelectedAssetMap(prev => {
        const next = { ...prev };
        currentPageAssetIds.forEach(id => delete next[id]);
        return next;
      });
      return;
    }

    setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageAssetIds])));
    setSelectedAssetMap(prev => {
      const next = { ...prev };
      visibleTableAssets.forEach(asset => {
        next[asset.id] = asset;
      });
      return next;
    });
  };

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { key: 'ALL', label: 'TỔNG TÀI SẢN', status: '', value: stats.total, icon: <Box className="h-4 w-4" />, color: 'primary' },
      { key: 'ASSIGNED', label: 'ĐANG SỬ DỤNG', status: 'ASSIGNED', value: stats.assigned, icon: <CheckCircle2 className="h-4 w-4" />, color: 'blue' },
      { key: 'IN_STOCK', label: 'TRONG KHO', status: 'IN_STOCK', value: stats.inStock, icon: <Box className="h-4 w-4" />, color: 'emerald' },
      { key: 'DAMAGED', label: 'BÁO HỎNG', status: 'DAMAGED', value: stats.damaged, icon: <AlertCircle className="h-4 w-4" />, color: 'amber' },
      { key: 'LOST', label: 'MẤT / THẤT THOÁT', status: 'LOST', value: stats.lost, icon: <ShieldAlert className="h-4 w-4" />, color: 'rose' },
    ];
  }, [stats]);

  const getStatusLabelText = (statusVal: string) => {
    const parts = statusVal.split(',').filter(Boolean);
    return parts.map(p => {
      switch (p) {
        case 'IN_STOCK': return 'Trong kho';
        case 'ASSIGNED': return 'Đang sử dụng';
        case 'RETIRED': return 'Đã thu hồi';
        case 'UNDER_REPAIR': return 'Đang sửa chữa';
        case 'PENDING_DISPOSAL': return 'Chờ thanh lý';
        case 'DISPOSED': return 'Đã thanh lý';
        case 'LOST': return 'Mất';
        case 'DAMAGED': return 'Hỏng';
        default: return p;
      }
    }).join(', ');
  };

  const selectedAssets = useMemo(() => {
    const currentPageMap = new Map(assets.map(asset => [asset.id, asset]));
    return selectedIds
      .map(id => selectedAssetMap[id] || currentPageMap.get(id))
      .filter(Boolean);
  }, [assets, selectedAssetMap, selectedIds]);

  const groupedAssetBooks = useMemo<AssetGroupedBook[]>(() => {
    const getAssetPrefixParts = (asset: any) => {
      const codeParts = String(asset.assetCode || '').split('.').map((part: string) => part.trim()).filter(Boolean);
      const prefixParts = codeParts.length > 1 ? codeParts.slice(0, -1) : codeParts;
      if (prefixParts.length > 0) return prefixParts;
      return [asset.level1Code, asset.level2Code, asset.level3Code, asset.level4Code].filter(Boolean);
    };

    const formatGroupPath = (parts: string[]) => {
      const cumulative = parts.map((_: string, index: number) => parts.slice(0, index + 1).join('.'));
      return cumulative.join(' - ') || 'Chưa có nhóm tài sản';
    };

    const getDepartmentLocationKey = (asset: any) => {
      const department = String(asset.departmentName || '').trim() || 'Chưa có phòng ban';
      const locationParts = [
        String(asset.cityName || '').trim(),
        cleanLocationName(asset.cityName, asset.locationName, asset.projectName, asset.departmentName)
      ].filter(Boolean);
      return `${department} / ${locationParts.join(' - ') || 'Chưa có vị trí'}`;
    };

    const getBreadcrumb = (asset: any) => [
      { label: 'Tài sản' },
      { label: asset.level1Name || asset.level1Code || 'Cấp 1' },
      { label: asset.level2Name || asset.level2Code || 'Cấp 2' },
      { label: asset.level3Name || asset.level3Code || 'Cấp 3' },
      { label: asset.level4Name || asset.level4Code || 'Cấp 4', filterKey: 'level4Name', filterValue: asset.level4Name || '' },
    ].filter(item => item.label);

    const isNeedsAction = (asset: any) => {
      return ['DAMAGED', 'BROKEN', 'LOST', 'UNDER_REPAIR', 'PENDING_DISPOSAL'].includes(asset.status)
        || (asset.offboardingAlert && !asset.offboardingResolvedAt);
    };

    const groupMap = new Map<string, any>();
    groupedViewAssets.forEach((asset) => {
      const prefixParts = getAssetPrefixParts(asset);
      const prefix = prefixParts.join('.');
      const groupKey = prefix || 'unknown';
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          key: groupKey,
          codePath: formatGroupPath(prefixParts),
          name: asset.level4Name || asset.assetNameShort || asset.assetName || '',
          breadcrumb: getBreadcrumb(asset),
          assets: [],
          locations: new Map<string, any>(),
          statusSummary: {
            assigned: 0,
            inStock: 0,
            needsAction: 0
          }
        });
      }

      const group = groupMap.get(groupKey);
      group.assets.push(asset);
      if (asset.status === 'ASSIGNED') group.statusSummary.assigned += 1;
      if (asset.status === 'IN_STOCK') group.statusSummary.inStock += 1;
      if (isNeedsAction(asset)) group.statusSummary.needsAction += 1;
      const locationKey = getDepartmentLocationKey(asset);
      if (!group.locations.has(locationKey)) {
        group.locations.set(locationKey, { key: locationKey, assets: [] });
      }
      group.locations.get(locationKey).assets.push(asset);
    });

    return Array.from(groupMap.values()).map((group) => ({
      ...group,
      locations: Array.from(group.locations.values()).sort((a: any, b: any) => a.key.localeCompare(b.key, 'vi'))
    }));
  }, [cleanLocationName, groupedViewAssets]);

  const locationAssetBooks = useMemo<AssetGroupedBook[]>(() => {
    const normalize = (value: unknown) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    const isNeedsAction = (asset: any) => {
      return ['DAMAGED', 'BROKEN', 'LOST', 'UNDER_REPAIR', 'PENDING_DISPOSAL'].includes(asset.status)
        || (asset.offboardingAlert && !asset.offboardingResolvedAt);
    };

    const getLocationHierarchy = (asset: any) => {
      let city = String(asset.cityName || '').trim();
      let project = String(asset.projectName || '').trim();
      const department = String(asset.departmentName || '').trim() || 'Chưa có phòng ban';
      const fullLocation = cleanLocationName(
        asset.cityName,
        asset.locationName,
        asset.projectName,
        asset.departmentName
      );
      const parts = String(fullLocation || '')
        .split(/\s+(?:-|\/)\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

      if (city && normalize(parts[0]) === normalize(city)) parts.shift();
      if (!city && parts.length >= 3) city = parts.shift() || '';

      if (project && normalize(parts[0]) === normalize(project)) parts.shift();
      if (!project && parts.length > 1) project = parts.shift() || '';

      const fallbackLocation = String(asset.locationName || '').trim();
      const location = parts.shift() || fallbackLocation || 'Chưa có vị trí';
      const locationDetail = parts.join(' - ') || 'Chưa có vị trí chi tiết';

      return {
        city: city || 'Chưa có thành phố',
        project: project || 'Chưa có dự án',
        location,
        locationDetail,
        department,
      };
    };

    const getCategoryLabel = (asset: any) => {
      const categoryParts = [
        asset.level1Name,
        asset.level2Name,
        asset.level3Name,
        asset.level4Name,
      ].map((part) => String(part || '').trim()).filter(Boolean);
      return categoryParts.length > 0
        ? `Nhóm tài sản / ${categoryParts.join(' / ')}`
        : 'Nhóm tài sản / Chưa phân loại';
    };

    const groupMap = new Map<string, any>();
    groupedViewAssets.forEach((asset) => {
      const hierarchy = getLocationHierarchy(asset);
      const key = [hierarchy.city, hierarchy.project, hierarchy.location, hierarchy.locationDetail, hierarchy.department]
        .map(normalize)
        .join('|');

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key: `location:${key}`,
          codePath: '',
          name: '',
          breadcrumb: [
            {
              label: hierarchy.city,
              filterKey: asset.cityName ? 'cityName' : undefined,
              filterValue: asset.cityName || undefined,
            },
            {
              label: hierarchy.project,
              filterKey: asset.projectName ? 'projectName' : undefined,
              filterValue: asset.projectName || undefined,
            },
            {
              label: hierarchy.location,
              filterKey: asset.locationName ? 'locationQuery' : undefined,
              filterValue: asset.locationName || undefined,
            },
            {
              label: hierarchy.locationDetail,
              filterKey: asset.locationName ? 'locationQuery' : undefined,
              filterValue: asset.locationName || undefined,
            },
            {
              label: hierarchy.department,
              filterKey: asset.departmentName ? 'departmentName' : undefined,
              filterValue: asset.departmentName || undefined,
            },
          ],
          sortPath: [hierarchy.city, hierarchy.project, hierarchy.location, hierarchy.locationDetail, hierarchy.department].join(' - '),
          assets: [],
          locations: new Map<string, any>(),
          statusSummary: {
            assigned: 0,
            inStock: 0,
            needsAction: 0,
          },
        });
      }

      const group = groupMap.get(key);
      group.assets.push(asset);
      if (asset.status === 'ASSIGNED') group.statusSummary.assigned += 1;
      if (asset.status === 'IN_STOCK') group.statusSummary.inStock += 1;
      if (isNeedsAction(asset)) group.statusSummary.needsAction += 1;

      const categoryKey = getCategoryLabel(asset);
      if (!group.locations.has(categoryKey)) {
        group.locations.set(categoryKey, { key: categoryKey, assets: [] });
      }
      group.locations.get(categoryKey).assets.push(asset);
    });

    return Array.from(groupMap.values())
      .sort((a, b) => a.sortPath.localeCompare(b.sortPath, 'vi'))
      .map((group) => ({
        ...group,
        locations: Array.from(group.locations.values())
          .sort((a: any, b: any) => a.key.localeCompare(b.key, 'vi')),
      }));
  }, [cleanLocationName, groupedViewAssets]);

  const handleSortSelection = (key: string, order: string, isFilter: boolean = false, filterKey?: string, filterValue?: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (isFilter && filterKey) {
      if (newParams.get(filterKey) === filterValue) {
        newParams.delete(filterKey);
      } else {
        newParams.set(filterKey, filterValue || '');
      }
    } else {
      newParams.set('sortBy', key);
      newParams.set('sortOrder', order);
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const activeFilterChips = useMemo(() => {
    const list: { label: string; value: string; onClear: () => void }[] = [];
    
    if (filters.status) {
      const parts = filters.status.split(',').filter(Boolean);
      parts.forEach((p: string) => {
        list.push({
          label: 'Trạng thái',
          value: getStatusLabel(p).label,
          onClear: () => {
            const next = parts.filter((x: string) => x !== p);
            updateParam('status', next.length > 0 ? next.join(',') : null);
          }
        });
      });
    }

    if (filters.cityName) {
      list.push({
        label: 'Thành phố',
        value: filters.cityName,
        onClear: () => updateParam('cityName', null)
      });
    }

    if (filters.projectName) {
      list.push({
        label: 'Dự án',
        value: filters.projectName,
        onClear: () => updateParam('projectName', null)
      });
    }

    if (filters.locationQuery) {
      list.push({
        label: 'Vị trí',
        value: filters.locationQuery,
        onClear: () => updateParam('locationQuery', null)
      });
    }

    if (filters.currentUserName) {
      list.push({
        label: 'Người dùng',
        value: filters.currentUserName,
        onClear: () => updateParam('currentUserName', null)
      });
    }

    if (filters.departmentName) {
      list.push({
        label: 'Phòng ban',
        value: filters.departmentName,
        onClear: () => updateParam('departmentName', null)
      });
    }

    if (filters.isAssigned === 'true') {
      list.push({
        label: 'Phân bổ',
        value: 'Đã cấp phát',
        onClear: () => updateParam('isAssigned', null)
      });
    } else if (filters.isAssigned === 'false') {
      list.push({
        label: 'Phân bổ',
        value: 'Chưa cấp phát',
        onClear: () => updateParam('isAssigned', null)
      });
    }

    if (filters.level4Name) {
      const parts = filters.level4Name.split(',').filter(Boolean);
      parts.forEach((p: string) => {
        list.push({
          label: 'Nhóm LV4',
          value: p,
          onClear: () => {
            const next = parts.filter((x: string) => x !== p);
            updateParam('level4Name', next.length > 0 ? next.join(',') : null);
          }
        });
      });
    }

    if (filters.companyCode) {
      list.push({
        label: 'Công ty',
        value: filters.companyCode,
        onClear: () => updateParam('companyCode', null)
      });
    }

    if (filters.supplierName) {
      list.push({
        label: 'Nhà cung cấp',
        value: filters.supplierName,
        onClear: () => updateParam('supplierName', null)
      });
    }

    if (filters.hasSerial === 'true') {
      list.push({
        label: 'Số Serial',
        value: 'Có Serial',
        onClear: () => updateParam('hasSerial', null)
      });
    } else if (filters.hasSerial === 'false') {
      list.push({
        label: 'Số Serial',
        value: 'Thiếu Serial',
        onClear: () => updateParam('hasSerial', null)
      });
    }

    if (filters.hasDocuments === 'true') {
      list.push({
        label: 'Hồ sơ',
        value: 'Có tài liệu',
        onClear: () => updateParam('hasDocuments', null)
      });
    } else if (filters.hasDocuments === 'false') {
      list.push({
        label: 'Hồ sơ',
        value: 'Thiếu tài liệu',
        onClear: () => updateParam('hasDocuments', null)
      });
    }

    if (filters.hasPrinted === 'true') {
      list.push({
        label: 'Tem in',
        value: 'Đã in tem',
        onClear: () => updateParam('hasPrinted', null)
      });
    } else if (filters.hasPrinted === 'false') {
      list.push({
        label: 'Tem in',
        value: 'Chưa in tem',
        onClear: () => updateParam('hasPrinted', null)
      });
    }

    if (filters.isChecked === 'true') {
      list.push({
        label: 'Kiểm kê',
        value: 'Đã kiểm kê',
        onClear: () => updateParam('isChecked', null)
      });
    } else if (filters.isChecked === 'false') {
      list.push({
        label: 'Kiểm kê',
        value: 'Chưa kiểm kê',
        onClear: () => updateParam('isChecked', null)
      });
    }

    if (filters.invoiceBatchId) {
      list.push({
        label: 'Hóa đơn',
        value: filterInvoiceNo || `ID: ${filters.invoiceBatchId}`,
        onClear: () => updateParam('invoiceBatchId', null)
      });
    }

    return list;
  }, [filters, lv4Categories, filterInvoiceNo]);

  // Status label calculation
  const statusActive = tempStatus.length > 0;
  const statusLabel = statusActive
    ? tempStatus.length === 1
      ? `Trạng thái: ${getStatusLabel(tempStatus[0]).label}`
      : `Trạng thái: ${tempStatus.length}`
    : 'Trạng thái';

  // Allocation label calculation
  const allocationActive = !!(filters.currentUserName || filters.departmentName || filters.isAssigned || filters.handoverDateFrom || filters.handoverDateTo);
  const allocationLabel = allocationActive
    ? filters.departmentName
      ? `Phân bổ: ${filters.departmentName}`
      : filters.currentUserName
        ? `Phân bổ: ${filters.currentUserName}`
        : filters.isAssigned === 'true'
          ? 'Phân bổ: Đã cấp phát'
          : filters.isAssigned === 'false'
            ? 'Phân bổ: Chưa cấp phát'
            : 'Phân bổ: Đang lọc'
    : 'Phân bổ';

  // Location label calculation
  const locationActive = !!(filters.cityName || filters.projectName || filters.locationQuery);
  const locationLabel = locationActive
    ? filters.cityName
      ? `Vị trí: ${filters.cityName}`
      : filters.projectName
        ? `Vị trí: ${filters.projectName}`
        : `Vị trí: ${filters.locationQuery}`
    : 'Vị trí';

  // Level 4 Category label calculation
  const lv4Active = tempLv4Name.length > 0;
  const lv4Label = lv4Active
    ? tempLv4Name.length === 1
      ? `Nhóm: ${tempLv4Name[0]}`
      : `Nhóm tài sản: ${tempLv4Name.length}`
    : 'Nhóm tài sản';

  // Advanced filters activity
  const isAdvancedActive = !!(
    filters.companyCode ||
    filters.priceMin ||
    filters.priceMax ||
    filters.purchaseDateFrom ||
    filters.purchaseDateTo ||
    filters.supplierName ||
    filters.hasSerial ||
    filters.hasDocuments
  );

  return (
    <div className="asset-manager-module clay-page min-h-[100dvh] h-full min-h-0 flex flex-col overflow-hidden">
      {/* COLLAPSIBLE HEADER */}
      <header className="clay-surface shrink-0 z-40 backdrop-blur-md rounded-b-[2rem] py-2 lg:py-3">
        <div className="px-2 sm:px-3 lg:px-4">
          {/* Title Section — Animates away */}
          <div className="hidden lg:block mb-3">
            <div className="flex items-end justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400 tracking-widest leading-none">Sổ tài sản</div>
                <h1 className="text-2xl font-black text-slate-950 tracking-tighter mt-1.5 leading-none">DANH MỤC TÀI SẢN</h1>
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                 Hệ thống quản lý tài sản v2.0
              </div>
            </div>
          </div>

          {/* Stats Section — Animates away */}
          <div className="overflow-hidden">
            {stats && (
              <div className="pt-1 pb-2 lg:pb-4">
                <div className="flex md:grid md:grid-cols-5 gap-2 lg:gap-3 overflow-x-auto md:overflow-visible custom-scrollbar pb-1 md:pb-0">
                  {statCards.map((card) => {
                    const active = card.key === 'ALL' ? !filters.status : filters.status === card.status;
                    return (
                      <StatCard
                        key={card.key}
                        label={card.label}
                        value={card.value}
                        icon={card.icon}
                        color={card.color}
                        active={active}
                        onClick={() => updateParam('status', card.status)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Search Section */}
          <div className="flex items-center gap-2 lg:gap-3 mt-1 lg:mt-3">
            <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input 
                  type="text" 
                  id="asset-list-global-search"
                  name="assetListGlobalSearch"
                  placeholder="Tìm kiếm toàn bộ dữ liệu tài sản..." 
                  className="clay-control w-full pl-9 pr-3 py-1 rounded-full focus:outline-none transition-all text-xs text-slate-900 placeholder:text-slate-400 h-[36px]"
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                />
            </div>
            <button
              type="button"
              onClick={() => setShowAssetControls((value) => !value)}
              className={`h-[36px] px-4 flex items-center gap-2 rounded-full border text-[12px] font-black transition-all whitespace-nowrap ${
                showAssetControls
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
              }`}
            >
              <Filter className="h-4 w-4" />
              {showAssetControls ? 'Ẩn bộ lọc' : 'Bộ lọc / Tác vụ'}
            </button>
            <div className="clay-control flex h-[36px] rounded-full p-0.5">
              <button
                type="button"
                onClick={() => setAssetViewMode('table')}
                className={cn(
                  "h-full px-3 rounded-full text-[11px] font-black transition-all whitespace-nowrap",
                  assetViewMode === 'table' ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Bảng
              </button>
              <button
                type="button"
                onClick={() => setAssetViewMode('grouped')}
                className={cn(
                  "h-full px-3 rounded-full text-[11px] font-black transition-all whitespace-nowrap",
                  assetViewMode === 'grouped' ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Nhóm
              </button>
              <button
                type="button"
                onClick={() => setAssetViewMode('location')}
                className={cn(
                  "h-full px-3 rounded-full text-[11px] font-black transition-all whitespace-nowrap",
                  assetViewMode === 'location' ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
                )}
              >
                Vị trí
              </button>
            </div>
          </div>

          {showAssetControls && (
            <>
          {/* Toolbar Section */}
          <div className="flex items-center gap-2 lg:gap-3 justify-between flex-wrap mt-2 lg:mt-3">
            {/* Left side: Chip filters */}
            <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">

              {/* Advanced Filter Drawer Trigger */}
              <button
                type="button"
                onClick={() => setIsAdvancedFilterOpen(true)}
                className={`flex items-center px-4 py-2 bg-white border rounded-full text-[13px] font-[800] transition-all h-[36px] shadow-sm gap-2 ${
                  isAdvancedActive 
                    ? 'border-primary-500 text-primary-700 bg-primary-50/10' 
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Filter className="h-4 w-4" />
                <span>Bộ lọc</span>
              </button>

              {/* Trạng thái filter chip */}
              <div className="hidden xl:block">
              <ChipPopoverFilter
                label={statusLabel}
                isActive={statusActive}
                onClear={clearStatusFilter}
                onApply={applyStatusFilter}
                onReset={clearStatusFilter}
              >
                <div className="space-y-2 py-1">
                  {[
                    {label: 'Đang sử dụng', value: 'ASSIGNED'},
                    {label: 'Trong kho', value: 'IN_STOCK'},
                    {label: 'Chưa sử dụng', value: 'RETIRED'},
                    {label: 'Đang sửa chữa', value: 'UNDER_REPAIR'},
                    {label: 'Hỏng', value: 'DAMAGED'},
                    {label: 'Mất', value: 'LOST'},
                    {label: 'Chờ thanh lý', value: 'PENDING_DISPOSAL'},
                    {label: 'Đã thanh lý', value: 'DISPOSED'},
                  ].map((opt) => {
                    const checked = tempStatus.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center space-x-2.5 px-1 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (checked) {
                              setTempStatus(tempStatus.filter(x => x !== opt.value));
                            } else {
                              setTempStatus([...tempStatus, opt.value]);
                            }
                          }}
                          className="rounded border-slate-355 text-primary-600 focus:ring-primary-500 h-4 w-4"
                        />
                        <span className={`text-[13px] ${checked ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </ChipPopoverFilter>
              </div>

              {/* Phân bổ filter chip */}
              <div className="hidden xl:block">
              <ChipPopoverFilter
                label={allocationLabel}
                isActive={allocationActive}
                onClear={clearAllocationFilter}
                onApply={applyAllocationFilter}
                onReset={clearAllocationFilter}
              >
                <div className="space-y-4 py-2 w-64">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Người sử dụng</label>
                    <AutocompleteInput 
                      placeholder="Nhập tên..." 
                      value={tempUserName} 
                      onChange={setTempUserName} 
                      endpoint="/assets/filter-options/users" 
                      icon={<Search className="h-3 w-3" />}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Phòng ban</label>
                    <AutocompleteInput 
                      placeholder="Chọn bộ phận..." 
                      value={tempDeptName} 
                      onChange={setTempDeptName} 
                      endpoint="/assets/filter-options/departments" 
                      icon={<Search className="h-3 w-3" />}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Trạng thái phân bổ</label>
                    <select 
                      value={tempAllocation} 
                      onChange={(e) => setTempAllocation(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-[13px] font-[600] text-slate-700 focus:outline-none focus:ring-4 focus:ring-primary-50/50 focus:border-primary-500 h-[38px] transition-all shadow-sm"
                    >
                      <option value="">Tất cả</option>
                      <option value="ASSIGNED">Đã cấp phát (Đang sử dụng)</option>
                      <option value="UNASSIGNED">Chưa cấp phát (Trong kho)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ngày bàn giao</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                         type="date"
                        value={tempHandoverFrom}
                        onChange={(e) => setTempHandoverFrom(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-2 py-1 text-[11px] font-semibold text-slate-650 focus:outline-none focus:border-primary-500 h-[34px]"
                      />
                      <input
                        type="date"
                        value={tempHandoverTo}
                        onChange={(e) => setTempHandoverTo(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-2 py-1 text-[11px] font-semibold text-slate-650 focus:outline-none focus:border-primary-500 h-[34px]"
                      />
                    </div>
                  </div>
                </div>
              </ChipPopoverFilter>

              {/* Phòng ban filter chip */}
              <div className="hidden xl:block">
              <ChipPopoverFilter
                label={filters.departmentName ? `Phòng ban: ${filters.departmentName}` : 'Phòng ban'}
                isActive={!!filters.departmentName}
                onClear={() => {
                  setTempDeptName('');
                  updateParam('departmentName', null);
                }}
                onApply={() => {
                  updateParam('departmentName', tempDeptName);
                }}
                onReset={() => {
                  setTempDeptName('');
                  updateParam('departmentName', null);
                }}
              >
                <div className="space-y-2 py-2 w-64">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tên phòng ban</label>
                    <AutocompleteInput 
                      placeholder="Chọn phòng ban..." 
                      value={tempDeptName} 
                      onChange={setTempDeptName} 
                      endpoint="/assets/filter-options/departments" 
                      icon={<Search className="h-3 w-3" />}
                      className="w-full"
                    />
                  </div>
                </div>
              </ChipPopoverFilter>
              </div>
              </div>

              {/* Vị trí filter chip */}
              <div className="hidden xl:block">
              <ChipPopoverFilter
                label={locationLabel}
                isActive={locationActive}
                onClear={clearLocationFilter}
                onApply={applyLocationFilter}
                onReset={clearLocationFilter}
              >
                <div className="space-y-4 py-2 w-64">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tỉnh / Thành phố</label>
                    <AutocompleteInput 
                      placeholder="Chọn thành phố..." 
                      value={tempCity} 
                      onChange={setTempCity} 
                      endpoint="/assets/filter-options/cities" 
                      icon={<MapPin className="h-3 w-3" />}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Dự án</label>
                    <AutocompleteInput 
                      placeholder="Chọn dự án..." 
                      value={tempProject} 
                      onChange={setTempProject} 
                      endpoint="/assets/filter-options/projects" 
                      icon={<Box className="h-3 w-3" />}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Vị trí chi tiết</label>
                    <AutocompleteInput 
                      placeholder="Nhập vị trí..." 
                      value={tempLocation} 
                      onChange={setTempLocation} 
                      endpoint="/assets/filter-options/locations" 
                      icon={<MapPin className="h-3 w-3" />}
                      className="w-full"
                    />
                  </div>
                </div>
              </ChipPopoverFilter>
              </div>

              {/* Nhóm tài sản filter chip (LV4) */}
              <div className="hidden xl:block">
              <ChipPopoverFilter
                label={lv4Label}
                isActive={lv4Active}
                onClear={clearLv4Filter}
                onApply={applyLv4Filter}
                onReset={clearLv4Filter}
              >
                <div className="space-y-3 py-1 w-64">
                  <div className="relative">
                    <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Tìm nhóm tài sản (LV4)..."
                      value={lv4Search}
                      onChange={(e) => setLv4Search(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-50 text-[12px] font-bold text-slate-700 h-[34px]"
                    />
                  </div>
                  
                  <div className="space-y-1 max-h-52 overflow-y-auto custom-scrollbar">
                    {lv4Categories
                      .filter(c => !lv4Search || c.name.toLowerCase().includes(lv4Search.toLowerCase()) || c.code.toLowerCase().includes(lv4Search.toLowerCase()))
                      .map((cat) => {
                        const checked = tempLv4Name.includes(cat.name);
                        return (
                          <label key={cat.id} className="flex items-center space-x-2.5 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                if (checked) {
                                  setTempLv4Name(tempLv4Name.filter(x => x !== cat.name));
                                } else {
                                  setTempLv4Name([...tempLv4Name, cat.name]);
                                }
                              }}
                              className="rounded border-slate-350 text-primary-600 focus:ring-primary-500 h-4 w-4"
                            />
                            <span className={`text-[12px] ${checked ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>
                              {cat.name} <span className="text-[10px] text-slate-400 font-mono">({cat.code})</span>
                            </span>
                          </label>
                        );
                      })}
                    {lv4Categories.filter(c => !lv4Search || c.name.toLowerCase().includes(lv4Search.toLowerCase()) || c.code.toLowerCase().includes(lv4Search.toLowerCase())).length === 0 && (
                      <div className="text-center py-4 text-[12px] text-slate-400 italic">Không tìm thấy nhóm LV4</div>
                    )}
                  </div>
                </div>
              </ChipPopoverFilter>
              </div>
            </div>

            {/* Right side: Action Buttons */}
            <div className="flex items-center gap-2 ml-auto">
              <div className="relative xl:hidden">
                <button
                  type="button"
                  onClick={() => setIsAssetActionMenuOpen(!isAssetActionMenuOpen)}
                  className="h-11 px-4 flex items-center text-[12px] font-black bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-all text-slate-700 whitespace-nowrap shadow-xs"
                >
                  <MoreVertical className="mr-1.5 h-4 w-4" /> Tác vụ
                </button>
                {isAssetActionMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsAssetActionMenuOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 p-2">
                      <Can permission="ASSET_EXPORT">
                        <button onClick={() => { setIsAssetActionMenuOpen(false); handleExportAll(); }} className="w-full h-11 px-3 rounded-xl flex items-center text-left text-xs font-black text-slate-700 hover:bg-slate-50">
                          <Download className="mr-2 h-4 w-4 text-slate-500" /> Export
                        </button>
                      </Can>
                      <Can permission="ASSET_VIEW">
                        <button onClick={() => { setIsAssetActionMenuOpen(false); setIsAssetReportOpen(true); }} className="w-full h-11 px-3 rounded-xl flex items-center text-left text-xs font-black text-slate-700 hover:bg-slate-50">
                          <Download className="mr-2 h-4 w-4 text-slate-500" /> Báo cáo tài sản
                        </button>
                      </Can>
                      <button onClick={() => { setIsAssetActionMenuOpen(false); setIsNormalizationOpen(true); }} className="w-full h-11 px-3 rounded-xl flex items-center text-left text-xs font-black text-slate-700 hover:bg-slate-50">
                        <Search className="mr-2 h-4 w-4 text-slate-500" /> Rà soát & Chuẩn hóa
                      </button>
                    </div>
                  </>
                )}
              </div>
              <Can permission="ASSET_EXPORT">
                <button 
                  onClick={handleExportAll}
                  className="hidden xl:flex h-[36px] px-4 items-center text-[12px] font-bold bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-all text-slate-600 whitespace-nowrap shadow-xs"
                >
                  <Download className="mr-1.5 h-4 w-4 text-slate-500" /> Export
                </button>
              </Can>

              <Can permission="ASSET_VIEW">
                <button 
                  type="button"
                  onClick={() => setIsAssetReportOpen(true)}
                  className="hidden xl:flex h-[36px] px-4 items-center text-[12px] font-bold bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-all text-slate-600 whitespace-nowrap shadow-xs"
                >
                  <Download className="mr-1.5 h-4 w-4 text-slate-500" /> Báo cáo tài sản
                </button>
              </Can>
              
              <button
                type="button"
                onClick={() => setIsNormalizationOpen(true)}
                className="hidden xl:flex h-[36px] px-4 items-center text-[12px] font-bold bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-all text-slate-650 whitespace-nowrap shadow-xs cursor-pointer"
              >
                🔍 Rà soát & Chuẩn hóa
              </button>

              <Can permission="ASSET_CREATE">
                <button 
                  type="button"
                  onClick={() => openModal("ASSET_CREATE", { onComplete: refreshAssetData })} 
                  className="h-11 xl:h-[36px] px-5 flex items-center text-[12px] font-black bg-primary-600 text-white rounded-full shadow-md hover:bg-primary-700 transition-all whitespace-nowrap"
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Thêm mới
                </button>
              </Can>
            </div>
          </div>

          {/* Preset and Sorting Chips Row */}
          <div className="hidden xl:flex mt-3 pt-3 border-t border-slate-100 flex-col gap-2.5">
            {/* Sorting Row */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-1.5">Sắp xếp theo:</span>
              {[
                { label: 'Mới thao tác', key: 'lastActionAt', order: 'desc' },
                { label: 'Mã tài sản A-Z', key: 'assetCode', order: 'asc' },
                { label: 'Giá trị cao-thấp', key: 'purchasePriceExVat', order: 'desc' },
                { label: 'Ngày mua mới nhất', key: 'purchaseDate', order: 'desc' },
                { label: 'Chưa kiểm kê', key: 'lastInventoryDate', order: 'asc' },
              ].map((s) => {
                const isActive = sortBy === s.key && sortOrder === s.order;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => handleSortSelection(s.key, s.order)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                      isActive 
                        ? 'bg-slate-900 border-slate-900 text-white font-bold' 
                        : 'bg-white border-slate-200 text-slate-650 hover:border-slate-350'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Presets Row */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-1.5">Lọc nhanh (Preset):</span>
              {[
                { label: 'Đang sử dụng', key: 'status', val: 'ASSIGNED' },
                { label: 'Trong kho', key: 'status', val: 'IN_STOCK' },
                { label: 'Chưa kiểm kê', key: 'isChecked', val: 'false' },
                { label: 'Chưa in tem', key: 'hasPrinted', val: 'false' },
                { label: 'Thiếu thông tin', key: 'hasSerial', val: 'false' },
                { label: 'Chờ thanh lý', key: 'status', val: 'PENDING_DISPOSAL' },
                { label: 'Đang sửa chữa', key: 'status', val: 'UNDER_REPAIR' },
                { label: 'Mất / thất thoát', key: 'status', val: 'LOST' },
              ].map((preset) => {
                const isActive = filters[preset.key] === preset.val;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSortSelection('', '', true, preset.key, preset.val)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                      isActive 
                        ? 'bg-primary-600 border-primary-600 text-white font-bold' 
                        : 'bg-white border-slate-200 text-slate-650 hover:border-slate-355'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Applied Filters chips */}
          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100 animate-in fade-in duration-200">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-1">Bộ lọc đang áp dụng:</span>
              {activeFilterChips.map((chip, idx) => (
                <div 
                  key={idx}
                  className="flex items-center bg-slate-50 border border-slate-200 rounded-full px-3 py-1 text-[12px] font-semibold text-slate-700 animate-in fade-in duration-200"
                >
                  <span className="text-slate-400 mr-1 font-bold">{chip.label}:</span>
                  <span>{chip.value}</span>
                  <button 
                    type="button"
                    onClick={chip.onClear} 
                    className="ml-1.5 p-0.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-rose-600 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button 
                type="button"
                onClick={clearAllFilters}
                className="text-[11px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-widest ml-2 transition-colors hover:underline"
              >
                Xóa tất cả
              </button>
            </div>
          )}
            </>
          )}
        </div>
      </header>

      {/* BULK ACTION BAR */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 w-[calc(100vw-1rem)] sm:w-auto max-w-5xl print:hidden">
          <div className="bg-[#0F172A] text-white px-3 sm:px-6 py-3 sm:py-4 rounded-2xl shadow-2xl flex items-center gap-2 sm:space-x-6 border border-[#1E293B] overflow-visible">
            <div className="flex items-center space-x-3">
              <div className="bg-primary-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold">
                {selectedIds.length}
              </div>
              <span className="text-sm font-bold tracking-tight">tài sản đang chọn</span>
            </div>
            <div className="h-6 w-px bg-[#334155]"></div>
            <div className="flex items-center space-x-2">
              <button onClick={clearSelection} className="h-11 px-3 hover:bg-[#1E293B] rounded-lg text-xs font-bold transition-colors text-slate-400 whitespace-nowrap">Bỏ chọn</button>
              <button 
                onClick={() => {
                  const onlyInStock = selectedAssets.every(a => a.status === 'IN_STOCK');
                  openModal("TRANSFER_WIZARD", {
                    initialAssetIds: selectedIds,
                    defaultType: onlyInStock ? 'HANDOVER' : 'TRANSFER',
                    source: 'ASSET_DETAIL',
                    onComplete: () => { clearSelection(); refreshAssetData(); }
                  });
                }} 
                className="h-11 flex items-center px-3 hover:bg-[#1E293B] rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
              >
                <UserPlus className="mr-2 h-4 w-4" /> Bàn giao / Điều chuyển
              </button>
              <button 
                onClick={() => {
                  openModal("INVENTORY_WIZARD", {
                    initialAssetIds: selectedIds,
                    onComplete: () => { clearSelection(); refreshAssetData(); }
                  });
                }} 
                className="h-11 flex items-center px-3 hover:bg-[#1E293B] rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
              >
                <ClipboardCheck className="mr-2 h-4 w-4" /> Kiểm kê
              </button>
              <button onClick={handleBulkPrint} className="h-11 flex items-center px-3 hover:bg-[#1E293B] rounded-lg text-xs font-bold transition-colors text-primary-400 whitespace-nowrap">
                <Printer className="mr-2 h-4 w-4" /> In tem tài sản
              </button>
              <div className="relative">
                <button 
                  onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                  className={cn(
                    "h-11 flex items-center px-3 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                    isMoreMenuOpen ? "bg-primary-600 text-white" : "hover:bg-[#1E293B] text-white"
                  )}
                >
                  Thêm thao tác <ChevronDown className={cn("ml-1.5 h-3.5 w-3.5 transition-transform", isMoreMenuOpen && "rotate-180")} />
                </button>
                
                {isMoreMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsMoreMenuOpen(false)}></div>
                    <div className="absolute bottom-full right-0 mb-4 w-72 bg-[#0F172A] border border-[#1E293B] rounded-2xl overflow-hidden shadow-2xl z-50 animate-in slide-in-from-bottom-2 text-left">
                      <div className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Nghiệp vụ</div>
                      <button onClick={() => { setIsMoreMenuOpen(false); handleBulkPrint(); }} className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-[#1E293B] flex items-center text-white">
                        <Printer className="mr-3 h-4 w-4 text-primary-400" /> In tem tài sản
                      </button>
                      <button onClick={() => { setIsMoreMenuOpen(false); handleExportSelected(); }} className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-[#1E293B] flex items-center text-emerald-400">
                        <Download className="mr-3 h-4 w-4" /> Xuất Excel
                      </button>
                      <button onClick={() => { setIsMoreMenuOpen(false); handleExportSelectedPdf(); }} className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-[#1E293B] flex items-center text-sky-300">
                        <FileUp className="mr-3 h-4 w-4" /> Xuất PDF
                      </button>

                      <div className="h-px bg-[#1E293B] my-1"></div>
                      <div className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Trạng thái</div>
                      <button onClick={() => { setIsMoreMenuOpen(false); openBulkLostForm(); }} className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-[#1E293B] flex items-center text-rose-300">
                        <ShieldAlert className="mr-3 h-4 w-4" /> Ghi nhận mất
                      </button>
                      <button onClick={() => { setIsMoreMenuOpen(false); handleBulkOffboardingAlert(); }} className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-[#1E293B] flex items-center text-red-300">
                        <AlertCircle className="mr-3 h-4 w-4" /> Báo tài sản nghỉ việc
                      </button>
                      <button
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          openModal("BM_FORM", {
                            code: 'BM03/QLTS',
                            data: { asset: selectedAssets[0], assets: selectedAssets },
                            onSubmit: () => { clearSelection(); refreshAssetData(); }
                          });
                        }}
                        className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-[#1E293B] flex items-center text-amber-400"
                      >
                        <AlertCircle className="mr-3 h-4 w-4" /> Cập nhật hư hỏng
                      </button>
                      <button
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          openModal("INVENTORY_WIZARD", {
                            initialAssetIds: selectedIds,
                            onComplete: () => { clearSelection(); refreshAssetData(); }
                          });
                        }}
                        className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-[#1E293B] flex items-center text-white"
                      >
                        <ClipboardCheck className="mr-3 h-4 w-4 text-slate-400" /> Đưa vào kiểm kê lại
                      </button>
                      <button onClick={() => { setIsMoreMenuOpen(false); handleNormalizeSelectedLocations(); }} className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-[#1E293B] flex items-center text-cyan-300">
                        <Edit3 className="mr-3 h-4 w-4" /> Chuẩn hóa vị trí
                      </button>

                      <div className="h-px bg-[#7F1D1D] my-1"></div>
                      <div className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest text-rose-400">Rủi ro cao</div>
                      <button onClick={() => { setIsMoreMenuOpen(false); openBulkLiquidationForm(); }} className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-orange-950/40 flex items-center text-orange-300">
                        <Trash2 className="mr-3 h-4 w-4" /> Thanh lý tài sản
                      </button>
                      <button onClick={() => { setIsMoreMenuOpen(false); handleBulkCancelAssets(); }} className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-rose-950/50 flex items-center text-rose-400">
                        <Trash className="mr-3 h-4 w-4" /> Hủy tài sản
                      </button>
                      <button onClick={() => { setIsMoreMenuOpen(false); handleBulkDeleteAssets(); }} className="w-full text-left px-4 py-3 text-[11px] font-bold hover:bg-rose-950/50 flex items-center text-rose-500">
                        <X className="mr-3 h-4 w-4" /> Xóa tài sản
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <button onClick={clearSelection} className="h-11 w-11 flex items-center justify-center hover:bg-[#1E293B] rounded-full transition-colors shrink-0">
              <X className="h-5 w-5 text-[#94A3B8]" />
            </button>
          </div>
        </div>
      )}

      {/* ASSET TABLE — fills remaining space */}
      <main className="asset-table-section flex-1 min-h-0 p-2 sm:p-3">
        {assetViewMode === 'location' ? (
          <AssetLocationHierarchyView
            groups={locationAssetBooks}
            assetCount={groupedViewAssets.length}
            loading={groupedViewLoading}
            selectedAssetId={selectedAssetId}
            isDetailOpen={isDetailOpen}
            onOpenAsset={openAssetDetail}
            onAssetAction={handleAssetAction}
            onAssetsAction={handleGroupedAssetsAction}
            onApplyFilter={updateParam}
            selectionResetKey={groupSelectionResetKey}
          />
        ) : assetViewMode === 'grouped' ? (
          <AssetGroupedView
            groups={groupedAssetBooks}
            assetCount={groupedViewAssets.length}
            loading={groupedViewLoading}
            viewLabel="View theo nhóm tài sản"
            groupLabel="nhóm"
            selectedAssetId={selectedAssetId}
            isDetailOpen={isDetailOpen}
            onOpenAsset={openAssetDetail}
            onAssetAction={handleAssetAction}
            onAssetsAction={handleGroupedAssetsAction}
            onApplyFilter={updateParam}
            selectionResetKey={groupSelectionResetKey}
          />
        ) : (
        <div className="clay-table-shell h-full rounded-2xl overflow-hidden flex flex-col">
          <div 
            className="flex-1 min-h-0 overflow-auto custom-scrollbar scroll-smooth"
          >
            <table className="min-w-[1050px] xl:min-w-[1510px] w-full text-left border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-[#F8FAFC] border-b border-[#E2E8F0]">
                <tr className="h-9">
                  <th className="px-3 w-12 sticky left-0 bg-[#F8FAFC] z-10">
                    <button onClick={toggleSelectAll} className="flex items-center justify-center w-11 h-11 -my-1 -mx-3">
                      {isCurrentPageFullySelected ? (
                        <CheckSquare className="h-4 w-4 text-primary-600" />
                      ) : isCurrentPagePartiallySelected ? (
                        <MinusSquare className="h-4 w-4 text-primary-600" />
                      ) : (
                        <Square className="h-4 w-4 text-[#CBD5E1]" />
                      )}
                    </button>
                  </th>
                  {sortableColumns.map(col => (
                    <th key={col.key} className={cn("relative px-3 uppercase text-[10px] font-black text-slate-400 tracking-widest", col.className)}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSort(col.key)}
                          className="group inline-flex min-w-0 items-center gap-1.5 hover:text-slate-700 transition-colors whitespace-nowrap"
                          title={`Sắp xếp ${col.label} A-Z / Z-A`}
                        >
                          <span className="truncate">{col.label}</span>
                          {sortBy === col.key && (
                            <span className="shrink-0 text-primary-600">
                              {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleTableFilterMenu(col.key)}
                          className={cn(
                            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100",
                            tableColumnFilters[col.key]
                              ? "bg-primary-100 text-primary-700"
                              : "text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                          )}
                          aria-label={`Lọc cột ${col.label}`}
                          title={`Lọc các dòng đang hiển thị theo ${col.label}`}
                        >
                          <Filter className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {openTableFilterKey === col.key && (
                        <TableColumnFilterMenu
                          key={`${col.key}-${tableFilterDatasetKey}`}
                          columnKey={col.key}
                          columnLabel={col.label}
                          options={tableFilterOptions[col.key] || []}
                          selectedValues={tableColumnFilters[col.key]}
                          loading={tableFilterLoading || !tableFilterDataReady}
                          alignRight={col.key === 'cityName' || col.key === 'status'}
                          onApply={(selectedValues) => updateTableColumnFilter(col.key, selectedValues)}
                          onClose={() => setOpenTableFilterKey(null)}
                        />
                      )}
                    </th>
                  ))}
                  <th className="px-3 w-16 text-right uppercase text-[10px] font-black text-slate-400 tracking-widest">Tác vụ</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {loading ? (
                <tr><td colSpan={9} className="p-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500 mx-auto" /></td></tr>
              ) : visibleTableAssets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <Filter className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                    <p className="text-[13px] font-bold text-slate-500">Không có dòng nào phù hợp bộ lọc cột</p>
                    <button
                      type="button"
                      onClick={clearTableColumnFilters}
                      className="mt-2 text-[11px] font-black text-primary-700 hover:underline"
                    >
                      Xóa bộ lọc cột
                    </button>
                  </td>
                </tr>
              ) : visibleTableAssets.map((asset) => {
                const status = getStatusLabel(asset.status);
                const hasOpenTicket = asset.repairTickets && asset.repairTickets.length > 0;
                const missingFields = getMissingAssetFields(asset);
                const locationIssues = getLocationIssues(asset);
                const displayLocationName = cleanLocationName(
                  asset.cityName,
                  asset.locationName,
                  asset.projectName,
                  asset.departmentName
                );
                const recoveryAlert = getRecoveryAlert(asset);
                const assigneeDisplay = getAssetAssigneeDisplay(asset);
                return (
                  <tr 
                    key={asset.id} 
                    className={cn(
                      "h-12 hover:bg-[#F8FAFC]/80 transition-all group cursor-pointer border-l-3",
                      selectedAssetId === asset.id && isDetailOpen ? "bg-primary-50 border-l-primary-500" : "border-l-transparent",
                      selectedIds.includes(asset.id) ? "bg-primary-50/30" : ""
                    )}
                    onClick={() => openAssetDetail(asset.id, 'info')}
                  >
                    <td className="px-3 sticky left-0 bg-white group-hover:bg-[#F8FAFC] z-10" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => { e.stopPropagation(); toggleAssetSelection(asset); }} className="flex items-center justify-center w-11 h-11 -my-2 -mx-3">
                        {selectedIds.includes(asset.id) 
                          ? <CheckSquare className="h-4 w-4 text-primary-600" /> 
                          : <Square className="h-4 w-4 text-[#CBD5E1] group-hover:text-[#94A3B8]" />
                        }
                      </button>
                    </td>
                    <td className="px-3 text-[12px] font-bold text-primary-700 font-mono" onClick={(e) => { e.stopPropagation(); openAssetDetail(asset.id, 'info'); }}>
                      {asset.assetCode}
                    </td>
                    <td className="px-3" onClick={(e) => { e.stopPropagation(); openAssetDetail(asset.id, 'info'); }}>
                      <p
                        className={cn(
                          "truncate text-[12px] font-semibold leading-tight",
                          asset.level4Name ? "text-slate-700" : "text-slate-400 italic"
                        )}
                        title={asset.level4Name || 'Chưa phân nhóm LV4'}
                      >
                        {asset.level4Name || 'Chưa phân nhóm'}
                      </p>
                    </td>
                    <td className="px-3" onClick={(e) => { e.stopPropagation(); openAssetDetail(asset.id, 'info'); }}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-slate-800 leading-tight whitespace-normal break-words">{asset.assetNameShort || asset.assetName}</p>
                          <p className="text-[10px] font-medium text-slate-400 leading-tight">Serial: <span className="text-slate-500">{asset.serialNumber || '-'}</span></p>
                          <p className="xl:hidden text-[10px] font-medium text-slate-400 leading-tight">{asset.cityName || '-'}{displayLocationName ? ` - ${displayLocationName}` : ''}</p>
                        </div>
                        {missingFields.length > 0 && (
                          <button
                            type="button"
                            title={`Bổ sung thông tin: ${missingFields.join(', ')}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openAssetDetail(asset.id, 'info');
                            }}
                            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all"
                          >
                            <AlertCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="hidden xl:table-cell px-3" onClick={(e) => { e.stopPropagation(); openAssetDetail(asset.id, 'assignment'); }}>
                      <p className={cn(
                        "text-[13px] font-semibold leading-tight truncate",
                        assigneeDisplay.isArea || asset.currentUserName ? "text-slate-800" : "text-slate-300 italic"
                      )} title={assigneeDisplay.name}>
                        {assigneeDisplay.name}
                      </p>
                      <p className={cn(
                        "text-[10px] font-medium leading-tight",
                        assigneeDisplay.isArea ? "text-primary-500" : "text-slate-400"
                      )}>
                        {assigneeDisplay.detail}
                      </p>
                    </td>
                    <td className="hidden xl:table-cell px-3" onClick={(e) => { e.stopPropagation(); openAssetDetail(asset.id, 'assignment'); }}>
                      <p className="text-[12px] font-semibold text-slate-700 leading-tight flex items-center gap-1.5 truncate" title={asset.departmentName || 'Chưa có phòng ban'}>
                        <Building2 className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{asset.departmentName || 'Chưa có phòng ban'}</span>
                      </p>
                    </td>
                    <td className="hidden xl:table-cell px-3" onClick={(e) => { e.stopPropagation(); openAssetDetail(asset.id, 'assignment'); }}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-slate-700 flex items-center">
                            <MapPin className="h-2.5 w-2.5 mr-1 text-slate-400" />
                            {asset.cityName || <span className="text-slate-300 italic">Chưa có thành phố</span>}
                          </p>
                          <p className={cn(
                            "text-[10px] font-medium ml-3.5 truncate",
                            locationIssues.length > 0 ? "text-amber-600" : "text-slate-400"
                          )}>
                            {displayLocationName || 'Chưa có vị trí'}
                          </p>
                        </div>
                        {locationIssues.length > 0 && (
                          <button
                            type="button"
                            title={`${locationIssues.join(', ')}. Bấm để chỉnh sửa.`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openAssetDetail(asset.id, 'assignment');
                            }}
                            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3" onClick={(e) => { e.stopPropagation(); openAssetDetail(asset.id, 'status_auto'); }}>
                      <div className="flex flex-col gap-1 items-start">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border", status.color)}>
                          {status.label}
                        </span>
                        {hasOpenTicket && (
                          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 whitespace-nowrap">
                            <Wrench className="h-2.5 w-2.5" /> Đang có phiếu sửa chữa
                          </span>
                        )}
                        {recoveryAlert && (
                          <span title={recoveryAlert.detail} className={cn("text-[9px] font-black border px-1.5 py-0.5 rounded-md flex items-center gap-0.5 whitespace-nowrap", recoveryAlert.className)}>
                            <AlertCircle className="h-2.5 w-2.5" /> {recoveryAlert.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                       <div className="relative inline-block">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === asset.id ? null : asset.id); }}
                             className="h-11 w-11 inline-flex items-center justify-center hover:bg-white rounded-xl border border-transparent hover:border-[#E2E8F0] text-[#94A3B8] hover:text-[#0F172A] transition-all shadow-sm"
                          >
                            <MoreVertical className="h-5 w-5" />
                          </button>
                          {activeMenuId === asset.id && (
                            <>
                              <div className="fixed inset-0 z-30" onClick={() => setActiveMenuId(null)}></div>
                              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-[#E2E8F0] z-40 p-2 animate-in fade-in zoom-in duration-150 text-left">
                                 <Can permission="ASSET_VIEW"><ActionItem label="Xem chi tiết" icon={<Eye className="h-4 w-4" />} onClick={() => handleAssetAction('view', asset)} /></Can>
                                 {asset.status !== 'LIQUIDATED' && asset.status !== 'LOST' && (
                                   <Can permission="TRANSFER_CREATE"><ActionItem label="Điều chuyển vị trí" icon={<MapPin className="h-4 w-4" />} onClick={() => handleAssetAction('location_transfer', asset)} /></Can>
                                 )}
                                 
                                 {asset.status === 'ASSIGNED' && (
                                   <>
                                     <Can permission="TRANSFER_CREATE"><ActionItem label="Điều chuyển tài sản" icon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => handleAssetAction('handover', asset)} /></Can>
                                     <Can permission="TRANSFER_CREATE"><ActionItem label="Thu hồi về kho" icon={<RotateCcw className="h-4 w-4" />} onClick={() => handleAssetAction('revoke', asset)} /></Can>
                                   </>
                                 )}
                                 {(asset.status === 'RETIRED' || asset.status === 'DAMAGED') && (
                                   <>
                                     {asset.status === 'DAMAGED' && (
                                       <Can permission="TRANSFER_CREATE">
                                         <ActionItem
                                           label="Điều chuyển tài sản hỏng"
                                           icon={<ArrowRightLeft className="h-4 w-4" />}
                                           onClick={() => handleAssetAction('handover', asset)}
                                         />
                                       </Can>
                                     )}
                                     <Can permission="TRANSFER_CREATE">
                                       <ActionItem
                                         label={asset.status === 'DAMAGED' ? 'Thu hồi tài sản hỏng về Hà Nội' : 'Thu hồi về kho'}
                                         icon={<RotateCcw className="h-4 w-4" />}
                                         onClick={() => handleAssetAction('revoke', asset)}
                                       />
                                     </Can>
                                   </>
                                 )}
                                 {asset.status !== 'ASSIGNED' && asset.status !== 'RETIRED' && asset.status !== 'DAMAGED' && (
                                   <Can permission="TRANSFER_CREATE"><ActionItem label="Cấp phát / Bàn giao" icon={<UserPlus className="h-4 w-4" />} onClick={() => handleAssetAction('handover', asset)} /></Can>
                                 )}

                                 <div className="h-px bg-[#F1F5F9] my-1"></div>
                                 <Can permission="INVENTORY_CREATE"><ActionItem label="Kiểm kê" icon={<ClipboardCheck className="h-4 w-4" />} onClick={() => handleAssetAction('inventory', asset)} /></Can>
                                 {hasOpenTicket ? (
                                   <>
                                     <Can permission="REPAIR_CREATE">
                                       <ActionItem
                                         label="Xem phiếu sửa chữa"
                                         icon={<Wrench className="h-4 w-4 text-amber-500" />}
                                         onClick={() => {
                                           setActiveMenuId(null);
                                           openModal('REPAIR_PROCESSING', { ticketId: asset.repairTickets[0].id, onSuccess: completeGroupedAction });
                                         }}
                                       />
                                     </Can>
                                     <Can permission="REPAIR_CREATE">
                                       <ActionItem
                                         label="Đã sửa xong"
                                         icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                                         onClick={() => handleAssetAction('repair_complete', asset)}
                                       />
                                     </Can>
                                   </>
                                 ) : (
                                   <Can permission="REPAIR_CREATE">
                                     <ActionItem 
                                       label="Sửa chữa / Bảo trì" 
                                       icon={<Wrench className="h-4 w-4" />} 
                                       onClick={() => handleAssetAction('repair', asset)} 
                                     />
                                   </Can>
                                 )}
                                  <Can permission="REPAIR_CREATE"><ActionItem label="Thanh lý" icon={<Trash className="h-4 w-4" />} onClick={() => handleAssetAction('liquidation', asset)} /></Can>
                                  {asset.offboardingAlert && !asset.offboardingResolvedAt && (
                                    <>
                                      <div className="h-px bg-[#F1F5F9] my-1"></div>
                                      <Can permission="ASSET_UPDATE"><ActionItem label="Thu hồi tài sản" icon={<RotateCcw className="h-4 w-4 text-red-500" />} onClick={() => handleAssetAction('offboarding_recover', asset)} /></Can>
                                      <Can permission="ASSET_UPDATE"><ActionItem label="Gia hạn ngày thu" icon={<Edit3 className="h-4 w-4 text-amber-500" />} onClick={() => handleAssetAction('offboarding_extend', asset)} /></Can>
                                      <Can permission="ASSET_UPDATE"><ActionItem label="Đánh dấu đã xử lý" icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} onClick={() => handleAssetAction('offboarding_resolve', asset)} /></Can>
                                      <Can permission="ASSET_UPDATE"><ActionItem label="Bỏ cảnh báo nghỉ việc" icon={<X className="h-4 w-4 text-slate-400" />} onClick={() => handleAssetAction('offboarding_clear', asset)} /></Can>
                                    </>
                                  )}
                                  <div className="h-px bg-[#F1F5F9] my-1"></div>
                                  <ActionItem label="Nhật ký tài sản" icon={<Activity className="h-4 w-4" />} onClick={() => handleAssetAction('history', asset)} />
                              </div>
                            </>
                          )}
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Complete-list summary — fixed at bottom */}
        <div className="min-h-12 shrink-0 px-3 sm:px-4 border-t border-[#E2E8F0] flex justify-between items-center bg-white">
           <div className="flex items-center gap-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Hiển thị toàn bộ {filteredTableTotal.toLocaleString('vi-VN')} tài sản
              </p>
              {activeTableFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearTableColumnFilters}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-primary-50 px-2 text-[10px] font-black text-primary-700 hover:bg-primary-100"
                  title="Xóa toàn bộ bộ lọc cột"
                >
                  <Filter className="h-3 w-3" />
                  {filteredTableTotal}/{tableFilterAssets.length} tài sản
                  <X className="h-3 w-3" />
                </button>
              )}
           </div>
        </div>
      </div>
        )}
    </main>

    {/* ADVANCED FILTERS DRAWER */}
    {isAdvancedFilterOpen && (
      <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setIsAdvancedFilterOpen(false)}></div>
        <div className="absolute inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 max-w-full flex md:pl-10">
          <div className="w-full md:w-[380px] md:max-w-[90vw] max-h-[70dvh] md:max-h-none bg-white shadow-2xl rounded-t-3xl md:rounded-t-none md:rounded-l-3xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 md:slide-in-from-right duration-200">
            {/* Header */}
            <div className="px-6 py-5 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
              <h2 className="text-lg font-black tracking-tight flex items-center">
                <Filter className="mr-2.5 h-5 w-5 text-slate-400" /> Bộ lọc nâng cao
              </h2>
              <button onClick={() => setIsAdvancedFilterOpen(false)} className="p-1.5 hover:bg-slate-800 rounded-full transition-all">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="space-y-3 xl:hidden">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sắp xếp</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Mới thao tác', key: 'lastActionAt', order: 'desc' },
                    { label: 'Mã A-Z', key: 'assetCode', order: 'asc' },
                    { label: 'Giá trị cao-thấp', key: 'purchasePriceExVat', order: 'desc' },
                    { label: 'Ngày mua mới nhất', key: 'purchaseDate', order: 'desc' },
                    { label: 'Chưa kiểm kê', key: 'lastInventoryDate', order: 'asc' },
                  ].map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        setTempSortBy(s.key);
                        setTempSortOrder(s.order);
                      }}
                      className={cn(
                        "h-11 px-3 rounded-full text-[12px] font-bold border transition-all",
                        tempSortBy === s.key && tempSortOrder === s.order
                          ? "bg-slate-900 border-slate-900 text-white"
                          : "bg-white border-slate-200 text-slate-650"
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 xl:hidden">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lọc nhanh</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Đang sử dụng', key: 'status', val: 'ASSIGNED' },
                    { label: 'Trong kho', key: 'status', val: 'IN_STOCK' },
                    { label: 'Chưa kiểm kê', key: 'isChecked', val: 'false' },
                    { label: 'Chưa in tem', key: 'hasPrinted', val: 'false' },
                    { label: 'Thiếu thông tin', key: 'hasSerial', val: 'false' },
                    { label: 'Chờ thanh lý', key: 'status', val: 'PENDING_DISPOSAL' },
                    { label: 'Đang sửa chữa', key: 'status', val: 'UNDER_REPAIR' },
                    { label: 'Mất / thất thoát', key: 'status', val: 'LOST' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                    onClick={() => {
                      if (preset.key === 'status') setTempStatus([preset.val]);
                      if (preset.key === 'isChecked') setTempIsChecked(preset.val);
                      if (preset.key === 'hasPrinted') setTempHasPrinted(preset.val);
                      if (preset.key === 'hasSerial') setTempHasSerial(preset.val);
                    }}
                      className={cn(
                        "h-11 px-3 rounded-full text-[12px] font-bold border transition-all",
                        (
                          (preset.key === 'status' && tempStatus.includes(preset.val))
                          || (preset.key === 'isChecked' && tempIsChecked === preset.val)
                          || (preset.key === 'hasPrinted' && tempHasPrinted === preset.val)
                          || (preset.key === 'hasSerial' && tempHasSerial === preset.val)
                        )
                          ? "bg-primary-600 border-primary-600 text-white"
                          : "bg-white border-slate-200 text-slate-650"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 xl:hidden">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trạng thái</label>
                {[
                  {label: 'Đang sử dụng', value: 'ASSIGNED'},
                  {label: 'Trong kho', value: 'IN_STOCK'},
                  {label: 'Chưa sử dụng', value: 'RETIRED'},
                  {label: 'Đang sửa chữa', value: 'UNDER_REPAIR'},
                  {label: 'Hỏng', value: 'DAMAGED'},
                  {label: 'Mất', value: 'LOST'},
                  {label: 'Chờ thanh lý', value: 'PENDING_DISPOSAL'},
                  {label: 'Đã thanh lý', value: 'DISPOSED'},
                ].map((opt) => {
                  const checked = tempStatus.includes(opt.value);
                  return (
                    <label key={opt.value} className="min-h-11 flex items-center space-x-2.5 px-2 py-1 hover:bg-slate-50 rounded-xl cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setTempStatus(checked ? tempStatus.filter(x => x !== opt.value) : [...tempStatus, opt.value])}
                        className="rounded border-slate-355 text-primary-600 focus:ring-primary-500 h-4 w-4"
                      />
                      <span className={`text-[13px] ${checked ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="space-y-4 xl:hidden">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Người sử dụng</label>
                  <AutocompleteInput placeholder="Nhập tên..." value={tempUserName} onChange={setTempUserName} endpoint="/assets/filter-options/users" icon={<Search className="h-3 w-3" />} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phòng ban</label>
                  <AutocompleteInput placeholder="Chọn phòng ban..." value={tempDeptName} onChange={setTempDeptName} endpoint="/assets/filter-options/departments" icon={<Search className="h-3 w-3" />} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phân bổ</label>
                  <select value={tempAllocation} onChange={(e) => setTempAllocation(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-primary-500 h-11 transition-all shadow-sm">
                    <option value="">Tất cả</option>
                    <option value="ASSIGNED">Đã cấp phát</option>
                    <option value="UNASSIGNED">Chưa cấp phát</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 xl:hidden">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tỉnh / Thành phố</label>
                  <AutocompleteInput placeholder="Chọn thành phố..." value={tempCity} onChange={setTempCity} endpoint="/assets/filter-options/cities" icon={<MapPin className="h-3 w-3" />} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dự án</label>
                  <AutocompleteInput placeholder="Chọn dự án..." value={tempProject} onChange={setTempProject} endpoint="/assets/filter-options/projects" icon={<Box className="h-3 w-3" />} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vị trí chi tiết</label>
                  <AutocompleteInput placeholder="Nhập vị trí..." value={tempLocation} onChange={setTempLocation} endpoint="/assets/filter-options/locations" icon={<MapPin className="h-3 w-3" />} className="w-full" />
                </div>
              </div>

              <div className="space-y-2 xl:hidden">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhóm tài sản</label>
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm nhóm tài sản..."
                    value={lv4Search}
                    onChange={(e) => setLv4Search(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-50 text-[12px] font-bold text-slate-700 h-11"
                  />
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {lv4Categories
                    .filter(c => !lv4Search || c.name.toLowerCase().includes(lv4Search.toLowerCase()) || c.code.toLowerCase().includes(lv4Search.toLowerCase()))
                    .map((cat) => {
                      const checked = tempLv4Name.includes(cat.name);
                      return (
                        <label key={cat.id} className="min-h-11 flex items-center space-x-2.5 px-2 py-1 hover:bg-slate-50 rounded-xl cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setTempLv4Name(checked ? tempLv4Name.filter(x => x !== cat.name) : [...tempLv4Name, cat.name])}
                            className="rounded border-slate-350 text-primary-600 focus:ring-primary-500 h-4 w-4"
                          />
                          <span className="text-[12px] font-medium text-slate-600">{cat.name}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Company Code */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Công ty chủ quản</label>
                <AutocompleteInput 
                  placeholder="Chọn công ty..." 
                  value={tempCompanyCode} 
                  onChange={setTempCompanyCode} 
                  endpoint="/assets/filter-options/companies" 
                  icon={<Box className="h-3 w-3" />}
                  className="w-full"
                />
              </div>

              {/* Purchase Price Range */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Giá mua (VNĐ)</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    placeholder="Từ..."
                    value={tempPriceMin}
                    onChange={(e) => setTempPriceMin(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-primary-500 h-[38px]"
                  />
                  <input
                    type="number"
                    placeholder="Đến..."
                    value={tempPriceMax}
                    onChange={(e) => setTempPriceMax(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-primary-500 h-[38px]"
                  />
                </div>
              </div>

              {/* Purchase Date Range */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ngày mua tài sản</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={tempPurchaseFrom}
                    onChange={(e) => setTempPurchaseFrom(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-primary-500 h-[38px]"
                  />
                  <input
                    type="date"
                    value={tempPurchaseTo}
                    onChange={(e) => setTempPurchaseTo(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-primary-500 h-[38px]"
                  />
                </div>
              </div>

              {/* Supplier Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhà cung cấp</label>
                <AutocompleteInput 
                  placeholder="Chọn nhà cung cấp..." 
                  value={tempSupplierName} 
                  onChange={setTempSupplierName} 
                  endpoint="/assets/filter-options/suppliers" 
                  icon={<Search className="h-3 w-3" />}
                  className="w-full"
                />
              </div>

              {/* Serial Check */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Số Serial</label>
                <select 
                  value={tempHasSerial} 
                  onChange={(e) => setTempHasSerial(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-primary-500 h-[38px] transition-all shadow-sm"
                >
                  <option value="">Tất cả</option>
                  <option value="true">Có Số Serial</option>
                  <option value="false">Không có Số Serial (Thiếu Serial)</option>
                </select>
              </div>

              {/* Documents Check */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hồ sơ / Chứng từ</label>
                <select 
                  value={tempHasDocuments} 
                  onChange={(e) => setTempHasDocuments(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-primary-500 h-[38px] transition-all shadow-sm"
                >
                  <option value="">Tất cả</option>
                  <option value="true">Có tài liệu đính kèm</option>
                  <option value="false">Thiếu tài liệu đính kèm</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex justify-between gap-4">
              <button 
                type="button"
                onClick={clearAdvancedFilters}
                className="flex-1 py-3 bg-white border border-slate-200 text-slate-650 rounded-2xl text-[13px] font-[800] hover:bg-slate-100 transition-colors uppercase tracking-wider text-center"
              >
                Thiết lập lại
              </button>
              <button 
                type="button"
                onClick={applyAdvancedFilters}
                className="flex-1 py-3 bg-slate-900 text-white rounded-2xl text-[13px] font-[800] hover:bg-slate-800 transition-colors shadow-xl shadow-slate-200 uppercase tracking-wider text-center"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

      {isAssetReportOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black uppercase tracking-widest text-slate-900">Báo cáo tài sản</h2>
                <p className="text-[11px] font-bold text-slate-400 mt-1">Dashboard nhanh - báo cáo mẫu - xuất Excel snapshot/biến động</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAssetReportOpen(false)}
                className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loại báo cáo</label>
                  <select
                    value={reportForm.reportType}
                    onChange={(e) => setReportForm({ ...reportForm, reportType: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800"
                  >
                    <option value="summary">Tổng hợp tài sản</option>
                    <option value="detail">Chi tiết tài sản</option>
                    <option value="by_unit">Tài sản theo đơn vị</option>
                    <option value="by_user">Tài sản theo người sử dụng</option>
                    <option value="by_location">Tài sản theo địa điểm</option>
                    <option value="increase">Tài sản tăng trong kỳ</option>
                    <option value="decrease">Tài sản giảm trong kỳ</option>
                    <option value="transfer">Điều chuyển / thu hồi tài sản</option>
                    <option value="abnormal">Tài sản hỏng / mất / chờ thanh lý</option>
                    <option value="inventory">Báo cáo kiểm kê</option>
                    <option value="history">Lịch sử biến động tài sản</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Thời điểm chọn</label>
                  <input
                    type="date"
                    value={reportForm.selectedDate}
                    onChange={(e) => setReportForm({ ...reportForm, selectedDate: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">So sánh với</label>
                  <select
                    value={reportForm.compareMode}
                    onChange={(e) => setReportForm({ ...reportForm, compareMode: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800"
                  >
                    <option value="current">Hiện tại</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mã công ty</label>
                  <select value={reportForm.companyCode} onChange={(e) => setReportForm({ ...reportForm, companyCode: e.target.value })} disabled={reportOptionsLoading} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white disabled:opacity-60">
                    <option value="">Toàn tập đoàn</option>
                    {reportOptions.companies.map((option) => <option key={option.value} value={option.value}>{option.value} - {option.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ban phòng</label>
                  <select value={reportForm.departmentName} onChange={(e) => setReportForm({ ...reportForm, departmentName: e.target.value })} disabled={reportOptionsLoading} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white disabled:opacity-60">
                    <option value="">Tất cả</option>
                    {reportOptions.departments.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Thành phố</label>
                  <select value={reportForm.cityName} onChange={(e) => setReportForm({ ...reportForm, cityName: e.target.value })} disabled={reportOptionsLoading} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white disabled:opacity-60">
                    <option value="">Tất cả</option>
                    {reportOptions.cities.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dự án</label>
                  <select value={reportForm.projectName} onChange={(e) => setReportForm({ ...reportForm, projectName: e.target.value })} disabled={reportOptionsLoading} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white disabled:opacity-60">
                    <option value="">Tất cả</option>
                    {reportOptions.projects.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vị trí / tầng / khu vực</label>
                  <select value={reportForm.locationQuery} onChange={(e) => setReportForm({ ...reportForm, locationQuery: e.target.value })} disabled={reportOptionsLoading} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white disabled:opacity-60">
                    <option value="">Tất cả</option>
                    {reportOptions.locations.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhóm tài sản</label>
                  <select value={reportForm.level4Code} onChange={(e) => setReportForm({ ...reportForm, level4Code: e.target.value })} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white">
                    <option value="">Tất cả</option>
                    {lv4Categories.slice().sort((a: any, b: any) => String(a.code || '').localeCompare(String(b.code || ''), 'vi')).map((category: any) => (
                      <option key={category.id || category.code} value={category.code}>{category.code} - {category.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trạng thái</label>
                  <select value={reportForm.status} onChange={(e) => setReportForm({ ...reportForm, status: e.target.value })} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white">
                    <option value="">Tất cả</option>
                    <option value="ASSIGNED">Đang sử dụng</option>
                    <option value="IN_STOCK">Tồn kho</option>
                    <option value="UNDER_REPAIR">Sửa chữa</option>
                    <option value="DAMAGED">Hỏng</option>
                    <option value="LOST">Mất</option>
                    <option value="LIQUIDATED">Thanh lý</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Người sử dụng</label>
                  <select value={reportForm.currentUserName} onChange={(e) => setReportForm({ ...reportForm, currentUserName: e.target.value })} disabled={reportOptionsLoading} className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white disabled:opacity-60">
                    <option value="">Tất cả</option>
                    {reportOptions.users.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
              </div>

              {reportPreview && (
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-black uppercase tracking-widest text-slate-500">Xem nhanh chỉ tiêu</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200">
                    {[
                      ['Tổng tài sản', reportPreview.totalAssets],
                      ['Đang sử dụng', reportPreview.assigned],
                      ['Tồn kho', reportPreview.inStock],
                      ['Hỏng / sửa chữa', (reportPreview.damaged || 0) + (reportPreview.underRepair || 0)],
                      ['Mất / thất thoát', reportPreview.lost],
                      ['Đã thanh lý', reportPreview.liquidated],
                      ['Tổng nguyên giá', `${Number(reportPreview.totalValue || 0).toLocaleString('vi-VN')}đ`],
                      ['Thời điểm chọn', reportForm.selectedDate]
                    ].map(([label, value]) => (
                      <div key={String(label)} className="bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                        <p className="text-lg font-black text-slate-900 mt-1">{value as any}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setIsAssetReportOpen(false)} className="px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest">Đóng</button>
              <button type="button" onClick={handlePreviewAssetReport} disabled={reportLoading} className="px-5 py-3 rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest disabled:opacity-60">
                {reportLoading ? 'Đang xử lý...' : 'Xem báo cáo'}
              </button>
              <button type="button" onClick={handleExportAssetReport} disabled={reportLoading} className="px-5 py-3 rounded-xl bg-primary-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-60">
                Xuất Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {isNormalizationOpen && (
        <NormalizationModal
          isOpen={isNormalizationOpen}
          onClose={() => {
            setIsNormalizationOpen(false);
            refreshAssetData();
          }}
          currentFilters={filters}
        />
      )}
  </div>
);
};

const TableColumnFilterMenu = ({
  columnKey,
  columnLabel,
  options,
  selectedValues,
  loading,
  alignRight,
  onApply,
  onClose,
}: {
  columnKey: string;
  columnLabel: string;
  options: string[];
  selectedValues?: string[];
  loading?: boolean;
  alignRight?: boolean;
  onApply: (selectedValues: string[]) => void;
  onClose: () => void;
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [draftValues, setDraftValues] = useState<string[]>(
    selectedValues ? selectedValues.filter((value) => options.includes(value)) : options
  );
  const normalizedSearch = searchValue.trim().toLocaleLowerCase('vi');
  const visibleOptions = options.filter((option) => (
    !normalizedSearch || option.toLocaleLowerCase('vi').includes(normalizedSearch)
  ));
  const allVisibleSelected = visibleOptions.length > 0
    && visibleOptions.every((option) => draftValues.includes(option));

  const toggleVisibleOptions = () => {
    const nextValues = allVisibleSelected
      ? draftValues.filter((value) => !new Set(visibleOptions).has(value))
      : Array.from(new Set([...draftValues, ...visibleOptions]));
    setDraftValues(nextValues);
    onApply(nextValues);
  };

  const toggleOption = (option: string) => {
    const nextValues = draftValues.includes(option)
      ? draftValues.filter((value) => value !== option)
      : [...draftValues, option];
    setDraftValues(nextValues);
    onApply(nextValues);
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default"
        aria-label="Đóng bộ lọc cột"
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute top-full z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left normal-case tracking-normal shadow-2xl",
          alignRight ? "right-2" : "left-2"
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] font-black uppercase text-slate-600" title={columnLabel}>
            Lọc: {columnLabel}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            id={`table-column-filter-${columnKey}`}
            name={`tableColumnFilter${columnKey}`}
            type="text"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Tìm trong toàn bộ danh sách..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          />
        </div>

        <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-100 p-1 custom-scrollbar">
          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-[11px] font-bold text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
              Đang tải đầy đủ danh sách...
            </div>
          ) : (
            <>
          <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-[11px] font-black text-slate-700 hover:bg-slate-50">
            <input
              id={`table-column-filter-${columnKey}-all`}
              name={`tableColumnFilter${columnKey}All`}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleVisibleOptions}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span>{normalizedSearch ? 'Chọn tất cả kết quả tìm' : 'Chọn tất cả'}</span>
          </label>
          {visibleOptions.length === 0 ? (
            <p className="px-2 py-5 text-center text-[11px] font-semibold text-slate-400">Không tìm thấy giá trị</p>
          ) : visibleOptions.map((option, index) => (
            <label
              key={option}
              className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              title={option}
            >
              <input
                id={`table-column-filter-${columnKey}-${index}`}
                name={`tableColumnFilter${columnKey}Value`}
                type="checkbox"
                checked={draftValues.includes(option)}
                onChange={() => toggleOption(option)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="truncate">{option}</span>
            </label>
          ))}
            </>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setDraftValues(options);
              onApply(options);
            }}
            disabled={loading}
            className="min-h-9 px-2 text-[11px] font-black text-slate-500 hover:text-slate-800"
          >
            Xóa lọc
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-lg bg-slate-900 px-3 text-[11px] font-black text-white hover:bg-slate-800"
          >
            Đóng
          </button>
        </div>
      </div>
    </>
  );
};

const StatCard = ({ label, value, icon, color, active, onClick }: any) => {
  const colors: any = {
    primary: {
      active: 'border-primary-500 ring-2 ring-primary-100 bg-primary-50/30 text-primary-700',
      inactive: 'border-slate-200 hover:border-primary-300 hover:-translate-y-0.5 text-slate-600 bg-white',
      iconActive: 'bg-primary-600 text-white shadow-md shadow-primary-200',
      iconInactive: 'bg-slate-50 text-slate-400 group-hover:bg-primary-50 group-hover:text-primary-600',
    },
    blue: {
      active: 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/30 text-blue-700',
      inactive: 'border-slate-200 hover:border-blue-300 hover:-translate-y-0.5 text-slate-600 bg-white',
      iconActive: 'bg-blue-600 text-white shadow-md shadow-blue-200',
      iconInactive: 'bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600',
    },
    emerald: {
      active: 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/30 text-emerald-700',
      inactive: 'border-slate-200 hover:border-emerald-300 hover:-translate-y-0.5 text-slate-600 bg-white',
      iconActive: 'bg-emerald-600 text-white shadow-md shadow-emerald-200',
      iconInactive: 'bg-slate-50 text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-600',
    },
    amber: {
      active: 'border-amber-500 ring-2 ring-amber-100 bg-amber-50/30 text-amber-700',
      inactive: 'border-slate-200 hover:border-amber-300 hover:-translate-y-0.5 text-slate-600 bg-white',
      iconActive: 'bg-amber-600 text-white shadow-md shadow-amber-200',
      iconInactive: 'bg-slate-50 text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-600',
    },
    rose: {
      active: 'border-rose-500 ring-2 ring-rose-100 bg-rose-50/30 text-rose-700',
      inactive: 'border-slate-200 hover:border-rose-300 hover:-translate-y-0.5 text-slate-600 bg-white',
      iconActive: 'bg-rose-600 text-white shadow-md shadow-rose-200',
      iconInactive: 'bg-slate-50 text-slate-400 group-hover:bg-rose-50 group-hover:text-rose-600',
    },
  };

  const style = colors[color] || colors.primary;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "clay-card h-[52px] md:h-[60px] px-3 lg:px-4 rounded-2xl border flex items-center gap-2 lg:gap-3 transition-all group w-[168px] md:w-full shrink-0 outline-none cursor-pointer",
        active ? style.active : style.inactive
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all",
        active ? style.iconActive : style.iconInactive
      )}>
        {icon}
      </div>
      <div className="min-w-0 text-left">
        <p className="text-[8px] lg:text-[9px] font-black uppercase text-[#94A3B8] tracking-wider leading-none">{label}</p>
        <p className="text-xl font-[900] text-[#0F172A] tracking-tighter leading-tight mt-0.5">
          {value?.toLocaleString('vi-VN') || 0}
        </p>
      </div>
    </button>
  );
};

const ActionItem = ({ label, icon, onClick }: any) => (
  <button onClick={onClick} className="w-full min-h-11 flex items-center px-4 py-3 text-[12px] font-black text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-xl transition-all uppercase tracking-tight">
    <span className="mr-3 text-[#94A3B8]">{icon}</span> {label}
  </button>
);

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

