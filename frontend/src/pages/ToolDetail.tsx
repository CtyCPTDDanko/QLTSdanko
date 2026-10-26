import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { CCDCChildItemsPanel } from '../components/CCDCChildItemsPanel';
import { toast } from 'react-toastify';
import { TOOL_CATEGORY_TREE, buildToolCategory, splitToolCategory } from '../constants/toolCategories';
import { 
  ArrowLeft, 
  User, 
  MapPin, 
  Building2, 
  Coins, 
  FileText, 
  Calendar, 
  Activity, 
  Wrench, 
  ShieldAlert, 
  CheckCircle2, 
  ClipboardCheck,
  Loader2,
  Trash,
  FolderOpen,
  ShieldCheck,
  ClipboardList,
  Plus,
  ArrowRightLeft,
  Box,
  Trash2,
  AlertCircle,
  Warehouse,
  Layers,
  Settings,
  X,
  Image as ImageIcon,
  ChevronDown,
  BarChart3,
  Receipt,
  AlertTriangle,
  Printer
} from 'lucide-react';

export const ToolDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tool, setTool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'childItems' | 'stocks' | 'batches' | 'transactions' | 'assignments' | 'repairs' | 'lost' | 'inventory' | 'inventoryPhotos' | 'lifecycle' | 'history' | 'documents' | 'analytics'>('info');
  const [transactionMenuOpen, setTransactionMenuOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  
  // Stock Actions Modal State
  const [activeStockModal, setActiveStockModal] = useState<'NONE' | 'TRANSFER' | 'ALLOCATE' | 'RECALL' | 'DAMAGE' | 'REPAIR_COMPLETE' | 'LOST' | 'LOST_FOUND' | 'BATCH' | 'ADJUST'>('NONE');

  // Modal Forms State
  const [transferForm, setTransferForm] = useState({ fromLocation: '', toLocation: '', quantity: 1, note: '' });
  const [allocateForm, setAllocateForm] = useState({ fromLocation: '', toLocation: '', quantity: 1, note: '' });
  const [recallForm, setRecallForm] = useState({ fromLocation: '', toLocation: '', quantity: 1, qtyGood: 1, qtyRepair: 0, qtyBroken: 0, qtyLost: 0, note: '' });
  const [damageForm, setDamageForm] = useState({ locationName: '', quantity: 1, canRepair: true, note: '' });
  const [repairCompleteForm, setRepairCompleteForm] = useState({ locationName: '', quantity: 1, actualCost: 0, note: '' });
  const [lostForm, setLostForm] = useState({ locationName: '', quantity: 1, responsibleUser: '', compensationValue: 0, documentNo: '', note: '' });
  const [lostFoundForm, setLostFoundForm] = useState({ locationName: '', quantity: 1, note: '' });
  const [batchForm, setBatchForm] = useState({ quantity: 1, purchasePrice: 0, purchaseDate: new Date().toISOString().split('T')[0], supplierName: '', locationName: '', note: '' });
  const [adjustForm, setAdjustForm] = useState({ locationName: '', actualQuantity: 0, action: 'ADJUST_STOCK' as 'ADJUST_STOCK' | 'RECORD_LOST', note: '' });

  const fetchToolDetail = async () => {
    try {
      const res = await api.get(`/tools/${id}`);
      setTool(res.data);
      
      // Auto adjust default active tab based on management type
      if (res.data.managementType === 'QUANTITY') {
        setActiveTab('info');
      }
    } catch (err) {
      toast.error("Không thể tải thông tin chi tiết CCDC.");
      navigate('/tools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchToolDetail();
  }, [id]);

  // Sync default select option values when modals open
  useEffect(() => {
    if (tool && tool.stocks && tool.stocks.length > 0) {
      const firstWithStock = tool.stocks.find((s: any) => s.quantityAvailable > 0)?.locationName || tool.stocks[0].locationName;
      const firstWithUsing = tool.stocks.find((s: any) => s.quantityUsing > 0)?.locationName || tool.stocks[0].locationName;
      const firstWithBroken = tool.stocks.find((s: any) => s.quantityBroken > 0)?.locationName || tool.stocks[0].locationName;
      const firstWithRepairing = tool.stocks.find((s: any) => s.quantityRepairing > 0)?.locationName || firstWithBroken;
      const firstWithLost = tool.stocks.find((s: any) => s.quantityLost > 0)?.locationName || tool.stocks[0].locationName;
      
      setTransferForm(prev => ({ ...prev, fromLocation: firstWithStock }));
      setAllocateForm(prev => ({ ...prev, fromLocation: firstWithStock }));
      setRecallForm(prev => ({ ...prev, fromLocation: firstWithUsing, toLocation: firstWithStock }));
      setDamageForm(prev => ({ ...prev, locationName: firstWithStock }));
      setRepairCompleteForm(prev => ({ ...prev, locationName: firstWithRepairing }));
      setLostForm(prev => ({ ...prev, locationName: firstWithStock }));
      setLostFoundForm(prev => ({ ...prev, locationName: firstWithLost }));
      setBatchForm(prev => ({ ...prev, locationName: firstWithStock }));
      setAdjustForm(prev => ({ ...prev, locationName: firstWithStock, actualQuantity: tool.stocks[0].quantityAvailable }));
    }
  }, [activeStockModal, tool]);

  const handleStockSubmit = async (e: React.FormEvent, endpoint: string, payload: any) => {
    e.preventDefault();
    try {
      setLoading(true);
      const result = await api.post(`/tools/stock/${endpoint}`, { ...payload, toolId: tool.id });
      const documentNo = result.data?.document?.documentNo;
      toast.success(documentNo ? `Đã tạo biên bản ${documentNo}.` : "Ghi nhận biến động kho thành công!");
      setActiveStockModal('NONE');
      fetchToolDetail();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Lỗi giao dịch kho.");
      setLoading(false);
    }
  };

  const handleDeleteTool = async () => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa Công cụ dụng cụ này? Dữ liệu lịch sử vẫn sẽ được bảo lưu.")) return;
    try {
      await api.delete(`/tools/${id}`);
      toast.success("Xóa CCDC thành công!");
      navigate('/tools');
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Lỗi khi xóa CCDC.");
    }
  };

  const handlePrintHandoverDocument = (documentId: number) => {
    const token = localStorage.getItem('token') || '';
    const printUrl = `${api.defaults.baseURL}/tools/handover/${documentId}/pdf?token=${encodeURIComponent(token)}`;
    const printWindow = window.open(printUrl, '_blank');
    if (!printWindow) {
      toast.error('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép popup.');
    }
  };

  const handlePrintStockTransaction = (transactionId: number) => {
    const token = localStorage.getItem('token') || '';
    const printUrl = `${api.defaults.baseURL}/tools/stock/${transactionId}/pdf?token=${encodeURIComponent(token)}`;
    const printWindow = window.open(printUrl, '_blank');
    if (!printWindow) {
      toast.error('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép popup.');
    }
  };

  const openEditModal = () => {
    const parsedCategory = splitToolCategory(tool.category);
    setEditForm({
      toolName: tool.toolName || '',
      category: tool.category || '',
      category1: parsedCategory.category1,
      category2: parsedCategory.category2,
      originalCategory: tool.category || '',
      originalToolCode: tool.toolCode || '',
      idempotencyKey: `tool-category-${tool.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      quantity: tool.quantity || 1,
      unit: tool.unit || 'Cái',
      purchasePrice: tool.purchasePrice || 0,
      vat: tool.vat || 0,
      shippingInstallCost: tool.shippingInstallCost || 0,
      totalAmount: tool.totalAmount || 0,
      supplierName: tool.supplierName || '',
      purchaseDate: tool.purchaseDate ? new Date(tool.purchaseDate).toISOString().split('T')[0] : '',
      currentUserName: tool.currentUserName || '',
      departmentName: tool.departmentName || '',
      companyName: tool.companyName || '',
      branchName: tool.branchName || '',
      buildingName: tool.buildingName || '',
      floorName: tool.floorName || '',
      areaName: tool.areaName || '',
      specificLocation: tool.specificLocation || '',
      initialCondition: tool.initialCondition || 'Mới 100%',
      note: tool.note || '',
      reason: 'Cập nhật thông tin CCDC từ màn hình chi tiết'
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const selectedCategory = buildToolCategory(editForm.category1, editForm.category2);
      const categoryChanged = selectedCategory && selectedCategory !== editForm.originalCategory;
      if (categoryChanged) {
        const confirmed = window.confirm('Đổi Nhóm CCDC sẽ sinh lại Mã CCDC cha theo nhóm mới. Mã con và liên kết hiện có được giữ nguyên. Bạn muốn tiếp tục?');
        if (!confirmed) {
          setLoading(false);
          return;
        }
      }

      const {
        reason,
        category1,
        category2,
        originalCategory,
        originalToolCode,
        idempotencyKey,
        ...payload
      } = editForm;

      await api.put(`/tools/${tool.id}`, {
        ...payload,
        category: selectedCategory || payload.category,
        idempotencyKey: categoryChanged ? idempotencyKey : undefined,
        reason
      });
      toast.success('Đã cập nhật thông tin CCDC và lưu log thay đổi.');
      setShowEditModal(false);
      fetchToolDetail();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi cập nhật thông tin CCDC.');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!document.getElementById('cloudinary-widget-script')) {
      const script = document.createElement('script');
      script.id = 'cloudinary-widget-script';
      script.src = 'https://upload-widget.cloudinary.com/global/all.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleUploadFile = async (fileType: string) => {
    if (!(window as any).cloudinary) {
      toast.error('Trình tải tệp Cloudinary chưa sẵn sàng. Vui lòng tải lại trang hoặc đợi trong giây lát!');
      return;
    }
    
    try {
      const configRes = await api.get('/settings/cloudinary');
      const { cloudName, apiKey, uploadPreset } = configRes.data;
      
      const widget = (window as any).cloudinary.createUploadWidget(
        {
          cloudName: cloudName || 'dhr0lgl8q',
          apiKey: apiKey || undefined,
          uploadPreset: uploadPreset || 'ml_default',
          multiple: false,
          resourceType: fileType === 'avatarUrl' || fileType === 'photoUrl' ? 'image' : 'auto'
        },
        async (error: any, result: any) => {
          if (!error && result && result.event === "success") {
            const secureUrl = result.info.secure_url;
            toast.info('Tải tệp lên Cloudinary thành công! Đang lưu thông tin...');
            
            try {
              const currentFiles = tool.filesJson ? JSON.parse(tool.filesJson) : {};
              currentFiles[fileType] = secureUrl;
              
              const payload = {
                filesJson: JSON.stringify(currentFiles)
              };
              
              await api.put(`/tools/${tool.id}`, payload);
              toast.success('Đã cập nhật tệp đính kèm thành công!');
              fetchToolDetail();
            } catch (err: any) {
              console.error(err);
              toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật.');
            }
          }
        }
      );
      widget.open();
    } catch (err) {
      console.error(err);
      toast.error('Không thể lấy cấu hình Cloudinary từ hệ thống.');
    }
  };

  const handleDeleteFile = async (fileType: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa tệp đính kèm này?")) return;
    try {
      const currentFiles = tool.filesJson ? JSON.parse(tool.filesJson) : {};
      currentFiles[fileType] = '';
      
      const payload = {
        filesJson: JSON.stringify(currentFiles)
      };
      
      await api.put(`/tools/${tool.id}`, payload);
      toast.success('Đã xóa tệp đính kèm!');
      fetchToolDetail();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật.');
    }
  };

  if (loading && !tool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <Loader2 className="h-10 w-10 text-primary-600 animate-spin" />
        <p className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Đang tải hồ sơ CCDC...</p>
      </div>
    );
  }

  if (!tool) return null;

  // Parsed industry and metadata attributes
  let industryAttributes: Record<string, any> = {};
  if (tool.industryAttributesJson) {
    try {
      industryAttributes = JSON.parse(tool.industryAttributesJson);
    } catch (e) {
      console.error(e);
    }
  }

  let operationalSpecs: Record<string, any> = {};
  if (tool.operationalSpecsJson) {
    try {
      operationalSpecs = JSON.parse(tool.operationalSpecsJson);
    } catch (e) {
      console.error(e);
    }
  }

  let filesInfo: Record<string, string> = {};
  if (tool.filesJson) {
    try {
      filesInfo = JSON.parse(tool.filesJson);
    } catch (e) {
      console.error(e);
    }
  }

  let warrantyInfo: Record<string, any> = {};
  if (tool.warrantyInfoJson) {
    try {
      warrantyInfo = JSON.parse(tool.warrantyInfoJson);
    } catch (e) {
      console.error(e);
    }
  }

  let customFields: Record<string, string> = {};
  if (tool.customFieldsJson) {
    try {
      customFields = JSON.parse(tool.customFieldsJson);
    } catch (e) {
      console.error(e);
    }
  }

  // Stock quantities breakdown calculation for QUANTITY mode
  let totalStock = 0;
  let totalAvailable = 0;
  let totalTransit = 0;
  let totalUsing = 0;
  let totalRepairing = 0;
  let totalBroken = 0;
  let totalLost = 0;
  let totalDestroyed = 0;

  if (tool.stocks && tool.stocks.length > 0) {
    tool.stocks.forEach((s: any) => {
      totalAvailable += s.quantityAvailable || 0;
      totalTransit += s.quantityTransit || 0;
      totalUsing += s.quantityUsing || 0;
      totalRepairing += s.quantityRepairing || 0;
      totalBroken += s.quantityBroken || 0;
      totalLost += s.quantityLost || 0;
      totalDestroyed += s.quantityDestroyed || 0;
    });
    totalStock = totalAvailable + totalTransit + totalUsing + totalRepairing + totalBroken + totalLost + totalDestroyed;
  } else {
    totalStock = tool.quantity || 0;
    if (tool.status === 'IN_STOCK') totalAvailable = tool.quantity;
    else if (tool.status === 'USING') totalUsing = tool.quantity;
    else if (tool.status === 'DAMAGED') totalBroken = tool.quantity;
    else if (tool.status === 'LOST') totalLost = tool.quantity;
  }

  const stockTypeLabels: Record<string, string> = {
    IMPORT: 'Nhập kho',
    TRANSFER: 'Luân chuyển',
    USE: 'Cấp phát',
    ALLOCATE: 'Cấp phát',
    RECALL: 'Thu hồi',
    DAMAGE: 'Báo hỏng',
    REPAIR_COMPLETE: 'Sửa xong',
    LOST: 'Báo mất',
    DESTROY: 'Hủy bỏ',
    ADJUST: 'Điều chỉnh',
    ADJUST_STOCK: 'Điều chỉnh tồn',
    RECORD_LOST: 'Ghi nhận mất'
  };

  const lifecycleEvents = [
    ...(tool.stockTransactions || []).map((t: any) => ({
      id: `stock-${t.id}`,
      date: t.createdAt,
      type: stockTypeLabels[t.type] || t.type || 'Biến động kho',
      source: 'Kho số lượng',
      title: `${stockTypeLabels[t.type] || t.type || 'Biến động'} ${t.quantity ? `${t.quantity} ${tool.unit || 'cái'}` : ''}`.trim(),
      description: [t.fromLocation ? `Từ: ${t.fromLocation}` : '', t.toLocation ? `Đến: ${t.toLocation}` : '', t.note || ''].filter(Boolean).join(' | '),
      actor: t.performedBy,
      tone: t.type === 'LOST' || t.type === 'DESTROY' ? 'red' : t.type === 'DAMAGE' ? 'amber' : t.type === 'IMPORT' || t.type === 'REPAIR_COMPLETE' ? 'emerald' : 'blue'
    })),
    ...(tool.assignments || []).map((a: any) => ({
      id: `assignment-${a.id}`,
      date: a.effectiveAt || a.createdAt,
      type: 'Bàn giao',
      source: 'Người sử dụng',
      title: `Bàn giao cho ${a.newUserName || '---'}`,
      description: [a.newDepartmentName ? `Bộ phận: ${a.newDepartmentName}` : '', a.newLocationName ? `Vị trí: ${a.newLocationName}` : '', a.note || ''].filter(Boolean).join(' | '),
      actor: a.previousUserName ? `Từ ${a.previousUserName}` : undefined,
      tone: 'indigo'
    })),
    ...(tool.repairTickets || []).map((r: any) => ({
      id: `repair-${r.id}`,
      date: r.reportedDate || r.createdAt,
      type: 'Sửa chữa',
      source: 'Phiếu sửa chữa',
      title: `${r.repairCode || 'Phiếu sửa chữa'} - ${r.status || 'OPEN'}`,
      description: [r.damageDescription, r.repairAction ? `Phương án: ${r.repairAction}` : '', r.actualCost ? `Chi phí: ${Number(r.actualCost).toLocaleString()} VNĐ` : ''].filter(Boolean).join(' | '),
      actor: r.reportedBy,
      tone: r.status === 'COMPLETED' ? 'emerald' : 'amber'
    })),
    ...(tool.lostReports || []).map((l: any) => ({
      id: `lost-${l.id}`,
      date: l.reportedDate || l.createdAt,
      type: 'Báo mất',
      source: 'Phiếu mất',
      title: `${l.lostCode || 'Phiếu báo mất'} - ${l.status || 'LOST'}`,
      description: [l.incidentDescription, l.responsibleUser ? `Người liên quan: ${l.responsibleUser}` : '', l.compensationNote || ''].filter(Boolean).join(' | '),
      actor: l.reportedBy,
      tone: 'red'
    })),
    ...(tool.inventoryItems || []).map((item: any) => ({
      id: `inventory-${item.id}`,
      date: item.checkedAt || item.inventoryCheck?.inventoryDate,
      type: 'Kiểm kê',
      source: 'Kiểm kê',
      title: `${item.inventoryCheck?.inventoryName || 'Đợt kiểm kê'} - ${item.result || item.checkStatus || 'PENDING'}`,
      description: [item.actualLocation ? `Vị trí thực tế: ${item.actualLocation}` : '', item.note || ''].filter(Boolean).join(' | '),
      actor: item.checkedBy,
      tone: item.result === 'MATCHED' ? 'emerald' : 'orange'
    })),
    ...(tool.liquidations || []).map((l: any) => ({
      id: `liquidation-${l.id}`,
      date: l.liquidationRecord?.liquidationDate,
      type: 'Thanh lý',
      source: 'Thanh lý',
      title: l.liquidationRecord?.liquidationCode || 'Hồ sơ thanh lý',
      description: [l.liquidationRecord?.reason, l.liquidationRecord?.buyerName ? `Đơn vị mua: ${l.liquidationRecord.buyerName}` : ''].filter(Boolean).join(' | '),
      actor: undefined,
      tone: 'slate'
    })),
    ...(tool.batches || []).map((b: any) => ({
      id: `batch-${b.id}`,
      date: b.purchaseDate || b.createdAt,
      type: 'Lô nhập',
      source: 'Mua hàng',
      title: `${b.batchNumber || 'Lô nhập'} - ${b.quantity || 0} ${tool.unit || 'cái'}`,
      description: [b.supplierName ? `Nhà cung cấp: ${b.supplierName}` : '', b.purchasePrice ? `Đơn giá: ${Number(b.purchasePrice).toLocaleString()} VNĐ` : ''].filter(Boolean).join(' | '),
      actor: undefined,
      tone: 'emerald'
    })),
    ...(tool.histories || []).map((h: any) => ({
      id: `history-${h.id}`,
      date: h.eventTime,
      type: h.actionType || 'Nhật ký',
      source: 'Hệ thống',
      title: [h.oldStatus, h.newStatus].filter(Boolean).length ? `${h.oldStatus || 'NONE'} → ${h.newStatus || 'NONE'}` : (h.actionType || 'Cập nhật hệ thống'),
      description: [h.oldLocationName && h.newLocationName ? `${h.oldLocationName} → ${h.newLocationName}` : '', h.newNote || h.oldNote || ''].filter(Boolean).join(' | '),
      actor: h.source,
      tone: 'slate'
    }))
  ]
    .filter((event: any) => event.date)
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const attributeLabels: Record<string, string> = {
    applicableBranch: 'Chi nhánh áp dụng',
    placementArea: 'Khu vực đặt',
    maintenanceSchedule: 'Lịch bảo dưỡng',
    usageCount: 'Số lần sử dụng',
    collectionConcept: 'Bộ sưu tập/concept',
    season: 'Mùa vụ',
    clientProject: 'Khách hàng/dự án',
    availableQuantity: 'Số lượng khả dụng',
    postEventCondition: 'Tình trạng sau sự kiện',
    comboKit: 'Bộ combo'
  };

  let statusBadge = 'bg-slate-100 text-slate-700';
  let statusText = tool.status;
  if (tool.status === 'IN_STOCK') {
    statusBadge = 'bg-blue-50 text-blue-700 border-blue-100 border';
    statusText = 'Trong kho';
  } else if (tool.status === 'USING') {
    statusBadge = 'bg-green-50 text-green-700 border-green-100 border';
    statusText = 'Đang dùng';
  } else if (tool.status === 'DAMAGED') {
    statusBadge = 'bg-amber-50 text-amber-700 border-amber-100 border';
    statusText = 'Hỏng';
  } else if (tool.status === 'LOST') {
    statusBadge = 'bg-red-50 text-red-700 border-red-100 border';
    statusText = 'Mất';
  } else if (tool.status === 'LIQUIDATED') {
    statusBadge = 'bg-slate-100 text-slate-500';
    statusText = 'Đã thanh lý';
  }

  const isQuantityMode = tool.managementType === 'QUANTITY';
  const sameInvoiceCount = tool.invoiceBatch?._count?.tools || tool.invoiceBatch?.tools?.length || 0;
  const hasRealPhoto = !!(filesInfo.avatarUrl || filesInfo.photoUrl);
  const hasSignedInvoice = !!(tool.invoiceBatch?.invoiceLegalStatus === 'SIGNED_VALID' || tool.invoiceBatch?.signedFileUrl || tool.invoiceBatch?.fileUrl);
  const hasHandoverDocument = (tool.assignments?.length || 0) > 0 || !!tool.handoverDate;
  const movementDocuments = Array.from(
    new Map(
      (tool.handoverItems || [])
        .filter((item: any) => item.handoverDocument)
        .map((item: any) => [item.handoverDocument.id, item.handoverDocument])
    ).values()
  ) as any[];
  const handoverDocuments = movementDocuments.filter((document: any) => document.type !== 'RECALL');
  const recallDocuments = movementDocuments.filter((document: any) => document.type === 'RECALL');
  const handoverTypeLabels: Record<string, string> = {
    HANDOVER: 'Bàn giao',
    TRANSFER: 'Điều chuyển',
    RECALL: 'Thu hồi'
  };
  const missingProfileItems = [
    !hasSignedInvoice ? 'Hóa đơn đã ký' : '',
    !hasRealPhoto ? 'Ảnh thực tế' : '',
    !hasHandoverDocument ? 'Biên bản bàn giao' : ''
  ].filter(Boolean);
  const usageCount = (tool.assignments?.length || 0) + (tool.stockTransactions?.filter((t: any) => ['USE', 'ALLOCATE', 'TRANSFER', 'RECALL'].includes(t.type)).length || 0);
  const repairCount = tool.repairTickets?.length || 0;
  const repairCost = tool.repairTickets?.reduce((sum: number, ticket: any) => sum + (ticket.actualCost || ticket.estimatedCost || 0), 0) || 0;
  const lostCount = totalLost + (tool.lostReports?.length || 0);
  const lossRate = totalStock > 0 ? Math.round((lostCount / totalStock) * 100) : 0;
  const lastInventoryDate = tool.inventoryItems?.[0]?.checkedAt || tool.inventoryItems?.[0]?.inventoryCheck?.completedAt || tool.inventoryItems?.[0]?.inventoryCheck?.createdAt;

  return (
    <div className="space-y-6 pb-20 px-4 max-w-7xl mx-auto">
      
      {/* 1. HEADER PROFILE */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-200">
        <div className="space-y-1">
          <button 
            onClick={() => navigate('/tools')} 
            className="flex items-center text-slate-500 hover:text-slate-900 transition-colors font-bold uppercase tracking-widest text-[10px] border-0 bg-transparent cursor-pointer mb-2"
          >
            <ArrowLeft className="mr-1 h-3 w-3" /> Quay lại danh sách
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-slate-950 tracking-tight">{tool.toolName}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadge}`}>
              {statusText}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-primary-50 text-primary-700 border border-primary-100">
              {tool.managementType === 'QUANTITY' ? 'Quản lý số lượng' : tool.managementType === 'BUNDLE' ? 'Theo bộ' : 'Từng mã'}
            </span>
          </div>
          <p className="font-mono text-xs font-bold text-slate-400 mt-1 uppercase tracking-tight">Mã CCDC: {tool.toolCode}</p>
        </div>

        <div className="flex gap-2 shrink-0">
          <button 
            onClick={openEditModal}
            className="flex items-center gap-2 px-4 py-2 border border-primary-200 text-primary-700 hover:bg-primary-50 rounded-xl text-xs font-bold transition-all bg-white"
          >
            <Settings className="h-4 w-4" /> Chỉnh sửa thông tin
          </button>
          <button 
            onClick={handleDeleteTool}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-650 hover:bg-red-50 rounded-xl text-xs font-bold transition-all bg-white"
          >
            <Trash className="h-4 w-4" /> Xóa CCDC
          </button>
        </div>
      </div>

      {missingProfileItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-black">Hồ sơ chưa hoàn thiện</p>
            <p className="text-xs font-bold mt-1">Thiếu: {missingProfileItems.join(', ')}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 2. LEFT PANEL: GENERAL METADATA */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2">
            <FileText className="h-4 w-4 text-primary-500" />
            Thông tin chi tiết
          </h3>

          <div className="space-y-4 text-xs font-semibold">
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Nhóm CCDC</span>
              <span className="text-slate-800 font-bold">{tool.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Số lượng tồn</span>
              <span className="text-slate-800 font-bold">{totalStock} {tool.unit}</span>
            </div>
            
            <hr className="border-slate-100" />
            
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tài chính & Mua sắm</h4>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Đơn giá</span>
              <span className="text-slate-800">{(tool.purchasePrice || 0).toLocaleString()} VNĐ</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Thuế VAT</span>
              <span className="text-slate-800">{(tool.vat || 0)} %</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Chi phí vận chuyển</span>
              <span className="text-slate-800">{(tool.shippingInstallCost || 0).toLocaleString()} VNĐ</span>
            </div>
            <div className="flex justify-between items-center bg-primary-50/50 p-2 rounded-xl">
              <span className="text-primary-750 font-black uppercase tracking-wider">Tổng giá trị</span>
              <span className="text-primary-850 font-black">{(tool.totalAmount || 0).toLocaleString()} VNĐ</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Nguồn hình thành</span>
              <span className="text-slate-800 font-bold">{
                tool.fundingSource === 'MUA_MOI' ? 'Mua mới' :
                tool.fundingSource === 'DIEU_CHUYEN' ? 'Điều chuyển' :
                tool.fundingSource === 'TU_SAN_XUAT' ? 'Tự sản xuất' :
                tool.fundingSource === 'KHACH_HANG_BAN_GIAO' ? 'Khách hàng bàn giao' :
                tool.fundingSource === 'TAI_TRO' ? 'Được tài trợ' : tool.fundingSource || 'Mua mới'
              }</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Ngày mua</span>
              <span className="text-slate-800 font-bold">
                {tool.purchaseDate ? new Date(tool.purchaseDate).toLocaleDateString('vi-VN') : '---'}
              </span>
            </div>
            {tool.invoiceBatch && (
              <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 space-y-3">
                <h4 className="text-[11px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> NGUỒN HÌNH THÀNH
                </h4>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Hóa đơn</span>
                  <span className="text-slate-900 font-black">{tool.invoiceBatch.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Nhà cung cấp</span>
                  <span className="text-slate-800 font-bold">{tool.invoiceBatch.supplierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Ngày mua</span>
                  <span className="text-slate-800 font-bold">{new Date(tool.invoiceBatch.invoiceDate).toLocaleDateString('vi-VN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold uppercase tracking-wider">Phiếu nhập</span>
                  <span className="text-primary-750 font-black">PN-CCDC-{tool.invoiceBatch.id.toString().padStart(6, '0')}</span>
                </div>
                <button
                  onClick={() => navigate(`/tools/invoices/${tool.invoiceBatch.id}`)}
                  className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 rounded-xl text-xs font-bold text-white transition-all"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Xem các món cùng hóa đơn
                </button>
              </div>
            )}
            {false && tool.invoiceBatch && (
              <>
                <hr className="border-slate-100" />
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hồ sơ mua hàng</h4>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Nguồn nhập</span>
                  <span className="text-primary-750 font-bold">PN-CCDC-{tool.invoiceBatch.id.toString().padStart(6, '0')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Hóa đơn</span>
                  <span className="text-slate-800 font-bold">{tool.invoiceBatch.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Nhà cung cấp</span>
                  <span className="text-slate-800">{tool.invoiceBatch.supplierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Ngày hóa đơn</span>
                  <span className="text-slate-800 font-bold">
                    {new Date(tool.invoiceBatch.invoiceDate).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                {tool.invoiceLine && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Số lượng ban đầu</span>
                      <span className="text-slate-800 font-bold">{tool.invoiceLine.quantity} {tool.unit || 'Chiếc'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Đơn giá</span>
                      <span className="text-slate-800">{(tool.invoiceLine.unitPrice || 0).toLocaleString()} VNĐ</span>
                    </div>
                  </>
                )}
                <button
                  onClick={() => navigate(`/tools/invoices/${tool.invoiceBatch.id}`)}
                  className="w-full mt-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-xl text-xs font-bold text-primary-700 transition-all"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Xem các món cùng hóa đơn này
                </button>
              </>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Hạn dùng dự kiến</span>
              <span className="text-slate-800">{tool.expectedUsefulLife ? `${tool.expectedUsefulLife} tháng` : '---'}</span>
            </div>

            <hr className="border-slate-100" />
            
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Định vị & Phân bổ</h4>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center"><User className="mr-1 h-3.5 w-3.5 text-slate-400" /> Người sử dụng</span>
              <span className="text-slate-800 font-bold">{tool.currentUserName || '---'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center"><Building2 className="mr-1 h-3.5 w-3.5 text-slate-400" /> Bộ phận sử dụng</span>
              <span className="text-slate-800">{tool.departmentName || '---'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider flex items-center"><MapPin className="mr-1 h-3.5 w-3.5 text-slate-400" /> Công ty thành viên</span>
              <span className="text-slate-800 font-bold">{tool.companyName || '---'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Chi nhánh / T.Phố</span>
              <span className="text-slate-850 font-medium">{tool.branchName || '---'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Tòa nhà / Dự án</span>
              <span className="text-slate-850 font-medium">{tool.buildingName || '---'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Tầng / Vị trí</span>
              <span className="text-slate-850 font-medium">{tool.floorName || '---'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Khu vực / Phòng</span>
              <span className="text-slate-850 font-medium">{tool.areaName || '---'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider">Vị trí chi tiết</span>
              <span className="text-slate-850 truncate max-w-[150px]">{tool.specificLocation || '---'}</span>
            </div>

            {Object.keys(industryAttributes).length > 0 && (
              <>
                <hr className="border-slate-100" />
                <div className="space-y-3">
                  <span className="text-primary-600 font-black text-[10px] uppercase tracking-widest block">Thuộc tính đặc thù ngành</span>
                  <div className="space-y-2">
                    {Object.keys(industryAttributes).map((key) => {
                      const label = attributeLabels[key] || key;
                      let val = industryAttributes[key];
                      if (key === 'maintenanceSchedule' && val) {
                        val = new Date(val).toLocaleDateString('vi-VN');
                      }
                      return (
                        <div key={key} className="flex justify-between items-center text-xs">
                          <span className="text-slate-400 font-bold uppercase tracking-wider">{label}</span>
                          <span className="text-slate-800 font-black bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <hr className="border-slate-100" />

            <div className="space-y-1">
              <span className="text-slate-400 font-bold uppercase tracking-wider block">Tình trạng ban đầu</span>
              <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200/50">{tool.initialCondition || 'Mới 100%'}</p>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400 font-bold uppercase tracking-wider block">Ghi chú</span>
              <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200/50">{tool.note || 'Không có ghi chú.'}</p>
            </div>
          </div>
        </div>

        {/* 3. RIGHT PANEL: LIFECYCLE HISTORY & STOCK OPERATIONS */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
          
          {/* TABS HEADER */}
          <div className="flex border-b border-slate-200 overflow-x-auto bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
            <button 
              onClick={() => setActiveTab('info')}
              className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'info' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
            >
              Tổng quan
            </button>

            <button
              onClick={() => setActiveTab('childItems')}
              className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'childItems' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
            >
              Danh sách mã con
            </button>

            {isQuantityMode ? (
              <>
                <button 
                  onClick={() => setActiveTab('stocks')}
                  className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'stocks' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
                >
                  Phân bổ tồn kho ({tool.stocks?.length || 0})
                </button>
                <button 
                  onClick={() => setActiveTab('batches')}
                  className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'batches' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
                >
                  Lô nhập hàng ({tool.batches?.length || 0})
                </button>
                <button 
                  onClick={() => setActiveTab('transactions')}
                  className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'transactions' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
                >
                  Biến động số lượng ({tool.stockTransactions?.length || 0})
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => setActiveTab('assignments')}
                  className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'assignments' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
                >
                  Cấp phát ({tool.assignments?.length || 0})
                </button>
                <button 
                  onClick={() => setActiveTab('repairs')}
                  className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'repairs' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
                >
                  Sửa chữa ({tool.repairTickets?.length || 0})
                </button>
                <button 
                  onClick={() => setActiveTab('lost')}
                  className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'lost' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
                >
                  Báo mất/Hỏng ({tool.lostReports?.length || 0})
                </button>
              </>
            )}

            <button 
              onClick={() => setActiveTab('inventory')}
              className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'inventory' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
            >
              Lịch sử kiểm kê ({tool.inventoryItems?.length || 0})
            </button>
            <button 
              onClick={() => setActiveTab('inventoryPhotos')}
              className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'inventoryPhotos' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
            >
              Ảnh kiểm kê ({tool.inventoryItems?.reduce((acc: number, item: any) => acc + (item.photos?.length || 0), 0) || 0})
            </button>
            <button
              onClick={() => setActiveTab('lifecycle')}
              className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'lifecycle' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
            >
              Lịch sử CCDC ({lifecycleEvents.length})
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'history' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
            >
              Nhật ký hệ thống ({tool.histories?.length || 0})
            </button>
            <button 
              onClick={() => setActiveTab('documents')}
              className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'documents' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
            >
              Hồ sơ chứng từ
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`px-5 py-4 border-b-2 font-black transition-all shrink-0 ${activeTab === 'analytics' ? 'border-primary-600 text-primary-700 bg-white' : 'border-transparent hover:text-slate-900 hover:bg-slate-100/50'}`}
            >
              Phân tích
            </button>
          </div>

          {/* TAB CONTENT */}
          <div className="p-6 flex-1 overflow-y-auto min-h-[400px]">
            
            {/* TAB: GENERAL OVERVIEW */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                
                {/* 1. QUANTITY STOCK PROFILE (If quantity mode) */}
                {isQuantityMode && (
                  <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-6 shadow-sm space-y-4">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <Warehouse className="h-4 w-4 text-primary-600" />
                      Trạng thái cân đối tồn kho hiện tại
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-8 gap-3 text-center">
                      <div className="bg-white p-3 rounded-2xl border">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tổng nhập</p>
                        <p className="text-xl font-black text-slate-800 mt-1">{totalStock}</p>
                      </div>
                      <div className="bg-green-50/50 p-3 rounded-2xl border border-green-100">
                        <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Khả dụng</p>
                        <p className="text-xl font-black text-green-700 mt-1">{totalAvailable}</p>
                      </div>
                      <div className="bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Đang luân chuyển</p>
                        <p className="text-xl font-black text-indigo-700 mt-1">{totalTransit}</p>
                      </div>
                      <div className="bg-blue-50/50 p-3 rounded-2xl border border-blue-100">
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Đang dùng</p>
                        <p className="text-xl font-black text-blue-700 mt-1">{totalUsing}</p>
                      </div>
                      <div className="bg-teal-50/50 p-3 rounded-2xl border border-teal-100">
                        <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">Đang sửa</p>
                        <p className="text-xl font-black text-teal-700 mt-1">{totalRepairing}</p>
                      </div>
                      <div className="bg-amber-50/50 p-3 rounded-2xl border border-amber-100">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Hỏng chờ XL</p>
                        <p className="text-xl font-black text-amber-700 mt-1">{totalBroken}</p>
                      </div>
                      <div className="bg-red-50/50 p-3 rounded-2xl border border-red-100">
                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Thất thoát/Mất</p>
                        <p className="text-xl font-black text-red-700 mt-1">{totalLost}</p>
                      </div>
                      <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Đã hủy</p>
                        <p className="text-xl font-black text-slate-600 mt-1">{totalDestroyed}</p>
                      </div>
                    </div>

                    {/* Stock Operations Panel */}
                    <div className="border-t border-slate-200 pt-4 space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Settings className="h-3 w-3" /> Tác vụ nghiệp vụ kho</p>
                      <div className="relative w-full sm:w-72">
                        <button
                          onClick={() => setTransactionMenuOpen(prev => !prev)}
                          className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-black transition-all"
                        >
                          <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Tạo giao dịch</span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${transactionMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {transactionMenuOpen && (
                          <div className="absolute left-0 top-full mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-xl z-20 py-1 overflow-hidden">
                            {[
                              { label: 'Điều chuyển kho', icon: <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />, modal: 'TRANSFER' as const },
                              { label: 'Cấp phát sử dụng', icon: <User className="h-3.5 w-3.5 text-green-500" />, modal: 'ALLOCATE' as const },
                              { label: 'Thu hồi', icon: <Box className="h-3.5 w-3.5 text-amber-500" />, modal: 'RECALL' as const },
                              { label: 'Báo hỏng/mất', icon: <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />, modal: 'DAMAGE' as const },
                              ...(totalRepairing > 0 ? [{ label: 'Đã sửa xong', icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />, modal: 'REPAIR_COMPLETE' as const }] : []),
                              ...(totalLost > 0 ? [{ label: 'Đã tìm lại', icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />, modal: 'LOST_FOUND' as const }] : []),
                              { label: 'Kiểm kê', icon: <ClipboardCheck className="h-3.5 w-3.5 text-slate-500" />, modal: 'ADJUST' as const }
                            ].map(action => (
                              <button
                                key={action.label}
                                onClick={() => {
                                  setTransactionMenuOpen(false);
                                  setActiveStockModal(action.modal);
                                }}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                {action.icon} {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="hidden grid-cols-2 sm:grid-cols-4 gap-2">
                        <button 
                          onClick={() => setActiveStockModal('TRANSFER')} 
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" /> Điều chuyển
                        </button>
                        <button 
                          onClick={() => setActiveStockModal('ALLOCATE')} 
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all"
                        >
                          <User className="h-3.5 w-3.5 text-green-500" /> Cấp phát sử dụng
                        </button>
                        <button 
                          onClick={() => setActiveStockModal('RECALL')} 
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all"
                        >
                          <Box className="h-3.5 w-3.5 text-amber-500" /> Thu hồi sau dùng
                        </button>
                        <button 
                          onClick={() => setActiveStockModal('DAMAGE')} 
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all"
                        >
                          <Wrench className="h-3.5 w-3.5 text-red-500" /> Báo hỏng
                        </button>
                        <button 
                          onClick={() => setActiveStockModal('REPAIR_COMPLETE')} 
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" /> Xác nhận sửa xong
                        </button>
                        <button 
                          onClick={() => setActiveStockModal('LOST')} 
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all"
                        >
                          <ShieldAlert className="h-3.5 w-3.5 text-orange-500" /> Báo mất/Thất thoát
                        </button>
                        <button 
                          onClick={() => setActiveStockModal('BATCH')} 
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all"
                        >
                          <Plus className="h-3.5 w-3.5 text-indigo-500" /> Nhập thêm lô mới
                        </button>
                        <button 
                          onClick={() => setActiveStockModal('ADJUST')} 
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5 text-slate-500" /> Kiểm kê kho
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. GENERAL INFO FIELDS */}
                {!isQuantityMode && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Người dùng hiện tại</p>
                      <p className="text-[16px] font-black text-slate-800 mt-1">{tool.currentUserName || 'KHO CCDC'}</p>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thời gian bàn giao</p>
                      <p className="text-[16px] font-black text-slate-800 mt-1">
                        {tool.handoverDate ? new Date(tool.handoverDate).toLocaleDateString('vi-VN') : '---'}
                      </p>
                    </div>
                  </div>
                )}

                {/* DYNAMIC SPECS SECTION */}
                {Object.keys(operationalSpecs).length > 0 && (
                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <h4 className="text-xs font-black text-primary-700 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-primary-500" />
                      Thông số vận hành đặc thù
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-xs font-semibold pt-1">
                      {operationalSpecs.usageCount !== undefined && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Số lần đã sử dụng</p>
                          <p className="text-slate-800 font-black text-sm mt-0.5">{operationalSpecs.usageCount} lần</p>
                        </div>
                      )}
                      {operationalSpecs.maxUsageCount !== undefined && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Số lần sử dụng tối đa</p>
                          <p className="text-slate-800 font-black text-sm mt-0.5">{operationalSpecs.maxUsageCount} lần</p>
                        </div>
                      )}
                      {operationalSpecs.lastUsedDate && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ngày dùng gần nhất</p>
                          <p className="text-slate-800 font-bold text-sm mt-0.5">
                            {new Date(operationalSpecs.lastUsedDate).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                      )}
                      {operationalSpecs.comboKitName && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tên bộ / combo</p>
                          <p className="text-slate-800 font-bold text-sm mt-0.5">{operationalSpecs.comboKitName}</p>
                        </div>
                      )}
                      {operationalSpecs.collectionConcept && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Concept / Bộ sưu tập</p>
                          <p className="text-slate-800 font-bold text-sm mt-0.5">{operationalSpecs.collectionConcept}</p>
                        </div>
                      )}
                      {operationalSpecs.season && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mùa vụ áp dụng</p>
                          <p className="text-slate-800 font-bold text-sm mt-0.5">{operationalSpecs.season}</p>
                        </div>
                      )}
                      {operationalSpecs.capacity && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dung tích</p>
                          <p className="text-slate-800 font-bold text-sm mt-0.5">{operationalSpecs.capacity}</p>
                        </div>
                      )}
                      {operationalSpecs.material && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Chất liệu</p>
                          <p className="text-slate-800 font-bold text-sm mt-0.5">{operationalSpecs.material}</p>
                        </div>
                      )}
                      {operationalSpecs.color && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Màu sắc</p>
                          <p className="text-slate-800 font-bold text-sm mt-0.5">{operationalSpecs.color}</p>
                        </div>
                      )}
                      {operationalSpecs.size && (
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Kích thước</p>
                          <p className="text-slate-800 font-bold text-sm mt-0.5">{operationalSpecs.size}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(operationalSpecs.childDescription || operationalSpecs.identifyingFeature || Array.isArray(operationalSpecs.mergedVariants)) && (
                  <div className="space-y-3 bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100">
                    <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider border-b border-emerald-100 pb-2 flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-emerald-600" />
                      Chi tiet ma con / bien the
                    </h4>
                    {(operationalSpecs.childDescription || operationalSpecs.identifyingFeature) && (
                      <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                        {operationalSpecs.childDescription && (
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mo ta rieng</p>
                            <p className="text-slate-800 font-bold text-sm mt-0.5">{operationalSpecs.childDescription}</p>
                          </div>
                        )}
                        {operationalSpecs.identifyingFeature && (
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dac diem nhan dang</p>
                            <p className="text-slate-800 font-bold text-sm mt-0.5">{operationalSpecs.identifyingFeature}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {Array.isArray(operationalSpecs.mergedVariants) && operationalSpecs.mergedVariants.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead className="text-[10px] text-slate-400 uppercase tracking-widest">
                            <tr>
                              <th className="text-left py-2">Ma goc</th>
                              <th className="text-left py-2">Ten</th>
                              <th className="text-left py-2">Mau</th>
                              <th className="text-left py-2">Mo ta</th>
                              <th className="text-left py-2">Nhan dang</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-100">
                            {operationalSpecs.mergedVariants.map((variant: any, idx: number) => (
                              <tr key={`${variant.sourceToolCode || 'variant'}-${idx}`}>
                                <td className="py-2 font-mono font-bold text-slate-700">{variant.sourceToolCode}</td>
                                <td className="py-2 text-slate-700">{variant.sourceToolName}</td>
                                <td className="py-2 text-slate-700">{variant.color || '---'}</td>
                                <td className="py-2 text-slate-700">{variant.description || '---'}</td>
                                <td className="py-2 text-slate-700">{variant.identifyingFeature || '---'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* WARRANTY INFO SECTION */}
                {Object.keys(warrantyInfo).length > 0 && (warrantyInfo.warrantyMonths || warrantyInfo.warrantyProvider) && (
                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-amber-500" />
                      Thông tin bảo hành sản phẩm
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-xs font-semibold pt-1">
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Hạn bảo hành</p>
                        <p className="text-slate-800 font-bold text-sm mt-0.5">{warrantyInfo.warrantyMonths ? `${warrantyInfo.warrantyMonths} tháng` : '---'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Đơn vị bảo hành</p>
                        <p className="text-slate-800 font-bold text-sm mt-0.5">{warrantyInfo.warrantyProvider || '---'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">SĐT Hỗ trợ kỹ thuật</p>
                        <p className="text-slate-800 font-bold text-sm mt-0.5">{warrantyInfo.warrantyPhone || '---'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ghi chú bảo hành</p>
                        <p className="text-slate-800 font-medium text-xs mt-0.5">{warrantyInfo.warrantyNote || '---'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ATTACHED FILES SECTION */}
                <div className="space-y-4 bg-slate-50 p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-500" />
                    Hồ sơ tài liệu & Hình ảnh đính kèm
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    {/* 1. Avatar */}
                    <div className="border border-slate-200 rounded-2xl p-4 bg-white flex items-center justify-between gap-3 shadow-sm hover:border-primary-300 transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center shrink-0">
                          {filesInfo.avatarUrl ? (
                            <img src={filesInfo.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">📷</span>
                          )}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ảnh đại diện CCDC</p>
                          {filesInfo.avatarUrl ? (
                            <a href={filesInfo.avatarUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600 hover:underline block truncate max-w-[120px]">Xem trực tiếp</a>
                          ) : (
                            <span className="text-xs text-slate-400 italic font-semibold">Chưa có ảnh</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => handleUploadFile('avatarUrl')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          Tải lên
                        </button>
                        {filesInfo.avatarUrl && (
                          <button 
                            onClick={() => handleDeleteFile('avatarUrl')}
                            className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-750 rounded-lg transition-colors"
                            title="Xóa tệp"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 2. Photo */}
                    <div className="border border-slate-200 rounded-2xl p-4 bg-white flex items-center justify-between gap-3 shadow-sm hover:border-primary-300 transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center shrink-0">
                          {filesInfo.photoUrl ? (
                            <img src={filesInfo.photoUrl} alt="Photo" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">🖼️</span>
                          )}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ảnh thực tế sản phẩm</p>
                          {filesInfo.photoUrl ? (
                            <a href={filesInfo.photoUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600 hover:underline block truncate max-w-[120px]">Xem trực tiếp</a>
                          ) : (
                            <span className="text-xs text-slate-400 italic font-semibold">Chưa có ảnh</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => handleUploadFile('photoUrl')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          Tải lên
                        </button>
                        {filesInfo.photoUrl && (
                          <button 
                            onClick={() => handleDeleteFile('photoUrl')}
                            className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-755 rounded-lg transition-colors"
                            title="Xóa tệp"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 3. Invoice */}
                    <div className="border border-slate-200 rounded-2xl p-4 bg-white flex items-center justify-between gap-3 shadow-sm hover:border-primary-300 transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center shrink-0 text-slate-450">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Hóa đơn mua hàng / VAT</p>
                          {filesInfo.invoiceUrl ? (
                            <a href={filesInfo.invoiceUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600 hover:underline block truncate max-w-[120px]">Xem/Tải xuống</a>
                          ) : (
                            <span className="text-xs text-slate-400 italic font-semibold">Chưa có file</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => handleUploadFile('invoiceUrl')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          Tải lên
                        </button>
                        {filesInfo.invoiceUrl && (
                          <button 
                            onClick={() => handleDeleteFile('invoiceUrl')}
                            className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-760 rounded-lg transition-colors"
                            title="Xóa tệp"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 4. Warranty Card */}
                    <div className="border border-slate-200 rounded-2xl p-4 bg-white flex items-center justify-between gap-3 shadow-sm hover:border-primary-300 transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-12 h-12 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center shrink-0 text-slate-450">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Thẻ bảo hành đính kèm</p>
                          {filesInfo.warrantyCardUrl ? (
                            <a href={filesInfo.warrantyCardUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary-600 hover:underline block truncate max-w-[120px]">Xem/Tải xuống</a>
                          ) : (
                            <span className="text-xs text-slate-400 italic font-semibold">Chưa có file</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => handleUploadFile('warrantyCardUrl')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-700 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          Tải lên
                        </button>
                        {filesInfo.warrantyCardUrl && (
                          <button 
                            onClick={() => handleDeleteFile('warrantyCardUrl')}
                            className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-765 rounded-lg transition-colors"
                            title="Xóa tệp"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* CUSTOM FIELDS SECTION */}
                {Object.keys(customFields).length > 0 && (
                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-slate-500" />
                      Thuộc tính mở rộng tự định nghĩa
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-xs font-semibold pt-1">
                      {Object.keys(customFields).map(key => (
                        <div key={key} className="bg-white border p-3 rounded-xl border-slate-200">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{key}</p>
                          <p className="text-slate-800 font-black text-sm mt-0.5">{customFields[key]}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Standard history recap */}
                {!isQuantityMode && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Biến động trạng thái gần nhất</h4>
                    <div className="space-y-3">
                      {tool.histories?.slice(0, 3).map((h: any) => (
                        <div key={h.id} className="flex gap-4 items-start bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                          <Activity className="h-4 w-4 text-primary-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-slate-800">{h.oldStatus} &rarr; {h.newStatus}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{h.oldNote}</p>
                            <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-tight">{new Date(h.eventTime).toLocaleString('vi-VN')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: STOCKS (QUANTITY ONLY) */}
            {activeTab === 'childItems' && (
              <CCDCChildItemsPanel parentTool={tool} />
            )}

            {activeTab === 'stocks' && isQuantityMode && (() => {
              // Pre-compute totals for the summary
              const totals = (tool.stocks || []).reduce((acc: any, s: any) => {
                acc.available  += s.quantityAvailable  || 0;
                acc.using      += s.quantityUsing      || 0;
                acc.broken     += (s.quantityBroken    || 0) + (s.quantityRepairing || 0);
                acc.transit    += s.quantityTransit    || 0;
                acc.lost       += s.quantityLost       || 0;
                acc.destroyed  += s.quantityDestroyed  || 0;
                acc.total      += (s.quantityAvailable || 0) + (s.quantityUsing || 0) + (s.quantityBroken || 0) + (s.quantityRepairing || 0) + (s.quantityTransit || 0) + (s.quantityLost || 0) + (s.quantityDestroyed || 0);
                return acc;
              }, { available: 0, using: 0, broken: 0, transit: 0, lost: 0, destroyed: 0, total: 0 });

              return (
                <div className="space-y-5">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Phân bổ tồn kho theo vị trí</h3>
                  
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                      <div className="text-lg font-black text-emerald-700">{totals.available}</div>
                      <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide mt-0.5">🟢 Khả dụng</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                      <div className="text-lg font-black text-blue-700">{totals.using}</div>
                      <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mt-0.5">🔵 Đang dùng</div>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-100">
                      <div className="text-lg font-black text-orange-700">{totals.broken}</div>
                      <div className="text-[10px] font-bold text-orange-500 uppercase tracking-wide mt-0.5">🟠 Hỏng/Sửa</div>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-100">
                      <div className="text-lg font-black text-purple-700">{totals.transit}</div>
                      <div className="text-[10px] font-bold text-purple-500 uppercase tracking-wide mt-0.5">🚚 Vận chuyển</div>
                    </div>
                    <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                      <div className="text-lg font-black text-red-700">{totals.lost}</div>
                      <div className="text-[10px] font-bold text-red-500 uppercase tracking-wide mt-0.5">🔴 Mất</div>
                    </div>
                    <div className="bg-slate-100 rounded-xl p-3 text-center border border-slate-200">
                      <div className="text-lg font-black text-slate-600">{totals.destroyed}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">⚫ Đã hủy</div>
                    </div>
                  </div>

                  {/* Per-location table with progress bars */}
                  <div className="space-y-3">
                    {(!tool.stocks || tool.stocks.length === 0) && (
                      <div className="text-center py-10 text-slate-400 italic text-sm border rounded-2xl bg-white">Chưa phân phối tồn kho nào.</div>
                    )}
                    {tool.stocks?.map((s: any) => {
                      const rowTotal = (s.quantityAvailable || 0) + (s.quantityUsing || 0) + (s.quantityBroken || 0) + (s.quantityRepairing || 0) + (s.quantityTransit || 0) + (s.quantityLost || 0) + (s.quantityDestroyed || 0);
                      const availPct = rowTotal > 0 ? ((s.quantityAvailable || 0) / rowTotal * 100) : 0;
                      const usingPct = rowTotal > 0 ? ((s.quantityUsing || 0) / rowTotal * 100) : 0;
                      const brokenPct = rowTotal > 0 ? (((s.quantityBroken || 0) + (s.quantityRepairing || 0)) / rowTotal * 100) : 0;
                      const lostPct  = rowTotal > 0 ? ((s.quantityLost || 0) / rowTotal * 100) : 0;
                      const locationParts = s.locationName?.split(' - ') || [];
                      const shortLoc = locationParts[locationParts.length - 1] || s.locationName;
                      const longLoc = s.locationName;
                      return (
                        <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-colors">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <div className="font-bold text-slate-800 text-sm">{shortLoc}</div>
                              {locationParts.length > 1 && <div className="text-[10px] text-slate-400 mt-0.5">{longLoc}</div>}
                            </div>
                            <div className="text-xs font-black text-slate-500 shrink-0">Tổng: {rowTotal}</div>
                          </div>
                          {/* Progress bar */}
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex mb-3">
                            {availPct > 0  && <div className="h-full bg-emerald-400 transition-all" style={{ width: `${availPct}%` }} title={`Khả dụng: ${s.quantityAvailable}`} />}
                            {usingPct > 0  && <div className="h-full bg-blue-400 transition-all"   style={{ width: `${usingPct}%` }}  title={`Đang dùng: ${s.quantityUsing}`} />}
                            {brokenPct > 0 && <div className="h-full bg-orange-400 transition-all" style={{ width: `${brokenPct}%` }} title={`Hỏng/Sửa: ${(s.quantityBroken||0)+(s.quantityRepairing||0)}`} />}
                            {lostPct > 0   && <div className="h-full bg-red-400 transition-all"    style={{ width: `${lostPct}%` }}   title={`Mất: ${s.quantityLost}`} />}
                          </div>
                          {/* Quantity breakdown badges */}
                          <div className="flex flex-wrap gap-2">
                            {(s.quantityAvailable || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                                🟢 Khả dụng: <strong>{s.quantityAvailable}</strong>
                              </span>
                            )}
                            {(s.quantityUsing || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold">
                                🔵 Đang dùng: <strong>{s.quantityUsing}</strong>
                              </span>
                            )}
                            {((s.quantityBroken || 0) + (s.quantityRepairing || 0)) > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-50 text-orange-700 text-[11px] font-bold">
                                🟠 Hỏng/Đang sửa: <strong>{(s.quantityBroken || 0) + (s.quantityRepairing || 0)}</strong>
                              </span>
                            )}
                            {(s.quantityTransit || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-50 text-purple-700 text-[11px] font-bold">
                                🚚 Đang vận chuyển: <strong>{s.quantityTransit}</strong>
                              </span>
                            )}
                            {(s.quantityLost || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-700 text-[11px] font-bold">
                                🔴 Mất: <strong>{s.quantityLost}</strong>
                              </span>
                            )}
                            {(s.quantityDestroyed || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold">
                                ⚫ Đã hủy: <strong>{s.quantityDestroyed}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals footer */}
                  {tool.stocks && tool.stocks.length > 1 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Tổng cộng — {tool.stocks.length} vị trí</div>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-black">🟢 {totals.available} khả dụng</span>
                        <span className="px-3 py-1.5 rounded-xl bg-blue-100 text-blue-800 text-xs font-black">🔵 {totals.using} đang dùng</span>
                        {totals.broken > 0 && <span className="px-3 py-1.5 rounded-xl bg-orange-100 text-orange-800 text-xs font-black">🟠 {totals.broken} hỏng/sửa</span>}
                        {totals.transit > 0 && <span className="px-3 py-1.5 rounded-xl bg-purple-100 text-purple-800 text-xs font-black">🚚 {totals.transit} vận chuyển</span>}
                        {totals.lost > 0 && <span className="px-3 py-1.5 rounded-xl bg-red-100 text-red-800 text-xs font-black">🔴 {totals.lost} mất</span>}
                        {totals.destroyed > 0 && <span className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-700 text-xs font-black">⚫ {totals.destroyed} đã hủy</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}



            {/* TAB: BATCHES (QUANTITY ONLY) */}
            {activeTab === 'batches' && isQuantityMode && (
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5"><Layers className="h-4 w-4" /> Danh sách các lô nhập hàng (Batches)</h3>
                <div className="overflow-x-auto border rounded-2xl bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Mã lô</th>
                        <th className="px-4 py-3 text-center">Số lượng nhập</th>
                        <th className="px-4 py-3 text-right">Đơn giá mua</th>
                        <th className="px-4 py-3 text-right">Tổng giá trị</th>
                        <th className="px-4 py-3">Nhà cung cấp</th>
                        <th className="px-4 py-3">Ngày nhập</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-700">
                      {tool.batches?.map((b: any) => (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono font-bold text-slate-800">{b.batchNumber}</td>
                          <td className="px-4 py-3 text-center font-bold">{b.quantity}</td>
                          <td className="px-4 py-3 text-right font-semibold">{(b.purchasePrice || 0).toLocaleString()} VNĐ</td>
                          <td className="px-4 py-3 text-right font-black text-slate-850">{((b.quantity || 0) * (b.purchasePrice || 0)).toLocaleString()} VNĐ</td>
                          <td className="px-4 py-3">{b.supplierName || '---'}</td>
                          <td className="px-4 py-3">{b.purchaseDate ? new Date(b.purchaseDate).toLocaleDateString('vi-VN') : '---'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: STOCK TRANSACTIONS (QUANTITY ONLY) */}
            {activeTab === 'transactions' && isQuantityMode && (
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5"><Activity className="h-4 w-4" /> Sổ biến động kho số lượng</h3>
                <div className="overflow-x-auto border rounded-2xl bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Thời gian</th>
                        <th className="px-4 py-3">Loại GD</th>
                        <th className="px-4 py-3 text-center">Số lượng</th>
                        <th className="px-4 py-3">Từ vị trí</th>
                        <th className="px-4 py-3">Đến vị trí</th>
                        <th className="px-4 py-3">Người thực hiện</th>
                        <th className="px-4 py-3">Ghi chú</th>
                        <th className="px-4 py-3 text-center">Biên bản</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-700">
                      {tool.stockTransactions?.map((t: any) => {
                        let typeText = t.type;
                        let typeColor = 'text-slate-700 bg-slate-100';
                        if (t.type === 'IMPORT') { typeText = 'Nhập mới'; typeColor = 'text-green-700 bg-green-50 border border-green-200'; }
                        else if (t.type === 'TRANSFER') { typeText = 'Điều chuyển'; typeColor = 'text-blue-700 bg-blue-50 border border-blue-200'; }
                        else if (t.type === 'USE') { typeText = 'Cấp phát'; typeColor = 'text-indigo-700 bg-indigo-50 border border-indigo-200'; }
                        else if (t.type === 'RECALL') { typeText = 'Thu hồi'; typeColor = 'text-purple-700 bg-purple-50 border border-purple-200'; }
                        else if (t.type === 'DAMAGE') { typeText = 'Báo hỏng'; typeColor = 'text-amber-700 bg-amber-50 border border-amber-200'; }
                        else if (t.type === 'REPAIR_COMPLETE') { typeText = 'Sửa xong'; typeColor = 'text-teal-700 bg-teal-50 border border-teal-200'; }
                        else if (t.type === 'LOST') { typeText = 'Báo mất'; typeColor = 'text-red-700 bg-red-50 border border-red-200'; }
                        else if (t.type === 'DESTROY') { typeText = 'Hủy bỏ'; typeColor = 'text-red-900 bg-red-100 border border-red-300'; }
                        else if (t.type === 'ADJUST') { typeText = 'Kiểm kê'; typeColor = 'text-slate-700 bg-slate-100 border border-slate-300'; }

                        return (
                          <tr key={t.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-semibold text-slate-500">{new Date(t.createdAt).toLocaleString('vi-VN')}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase tracking-wider ${typeColor}`}>{typeText}</span>
                            </td>
                            <td className="px-4 py-3 text-center font-black text-slate-800">
                              {t.type === 'IMPORT' || t.type === 'REPAIR_COMPLETE' || (t.type === 'ADJUST' && t.quantity > 0) ? `+${t.quantity}` : `${t.quantity}`}
                            </td>
                            <td className="px-4 py-3 text-slate-500 max-w-[150px] truncate">{t.fromLocation || '---'}</td>
                            <td className="px-4 py-3 text-slate-500 max-w-[150px] truncate">{t.toLocation || '---'}</td>
                            <td className="px-4 py-3 font-semibold">{t.performedBy}</td>
                            <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate" title={t.note}>{t.note || '---'}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handlePrintStockTransaction(t.id)}
                                className="inline-flex items-center justify-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-[10px] font-black uppercase text-primary-700 transition-colors hover:bg-primary-100"
                                title="In biên bản biến động"
                              >
                                <Printer className="h-3.5 w-3.5" /> In biên bản
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB: ASSIGNMENTS (INDIVIDUAL ONLY) */}
            {activeTab === 'assignments' && !isQuantityMode && (
              <div className="space-y-4">
                {tool.assignments?.map((a: any) => (
                  <div key={a.id} className="flex gap-4 items-start bg-slate-50 p-4 rounded-2xl border border-slate-200/50">
                    <User className="h-5 w-5 text-primary-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        Bàn giao cho: <span className="underline">{a.newUserName}</span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 font-semibold">Bộ phận: {a.newDepartmentName || '---'} | Vị trí: {a.newLocationName || '---'}</p>
                      {a.note && <p className="text-[11px] bg-white border border-slate-200 p-2 rounded-lg text-slate-600 mt-2">{a.note}</p>}
                      <p className="text-[9px] text-slate-400 font-bold mt-2 uppercase tracking-tight">
                        Hiệu lực từ: {new Date(a.effectiveAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>
                ))}
                {(!tool.assignments || tool.assignments.length === 0) && (
                  <div className="text-center py-12 text-slate-400 space-y-1">
                    <User className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="text-xs font-bold">Chưa có lịch sử bàn giao cho nhân sự nào.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB: REPAIRS (INDIVIDUAL ONLY) */}
            {activeTab === 'repairs' && !isQuantityMode && (
              <div className="space-y-4">
                {tool.repairTickets?.map((r: any) => (
                  <div key={r.id} className="flex gap-4 items-start bg-slate-50 p-4 rounded-2xl border border-slate-200/50">
                    <Wrench className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="text-sm font-bold text-slate-800">Mã phiếu: {r.repairCode}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>{r.status}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">Mô tả sự cố: {r.damageDescription}</p>
                      <div className="grid grid-cols-2 gap-4 mt-3 bg-white p-3 rounded-xl border border-slate-100 text-[11px]">
                        <p className="text-slate-500">Người báo hỏng: <span className="font-bold text-slate-700">{r.reportedBy}</span></p>
                        <p className="text-slate-500">Chi phí thực tế: <span className="font-bold text-slate-700">{(r.actualCost || 0).toLocaleString()} VNĐ</span></p>
                      </div>
                      {r.repairAction && <p className="text-[11px] bg-white border border-slate-200 p-2 rounded-lg text-slate-600 mt-2">Phương án sửa: {r.repairAction}</p>}
                      <p className="text-[9px] text-slate-400 font-bold mt-2 uppercase tracking-tight">
                        Ngày báo: {new Date(r.reportedDate).toLocaleDateString('vi-VN')}
                      </p>
                    </div>
                  </div>
                ))}
                {(!tool.repairTickets || tool.repairTickets.length === 0) && (
                  <div className="text-center py-12 text-slate-400 space-y-1">
                    <Wrench className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="text-xs font-bold">Chưa có phiếu sửa chữa nào được tạo.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB: LOST / DAMAGE REPORTS (INDIVIDUAL ONLY) */}
            {activeTab === 'lost' && !isQuantityMode && (
              <div className="space-y-4">
                {tool.lostReports?.map((l: any) => (
                  <div key={l.id} className="flex gap-4 items-start bg-slate-50 p-4 rounded-2xl border border-slate-200/50">
                    <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="text-sm font-bold text-slate-800">Phiếu báo mất: {l.lostCode}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700">{l.status}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">Sự việc: {l.incidentDescription}</p>
                      <div className="grid grid-cols-2 gap-4 mt-3 bg-white p-3 rounded-xl border border-slate-100 text-[11px]">
                        <p className="text-slate-500">Người báo: <span className="font-bold text-slate-700">{l.reportedBy || '---'}</span></p>
                        <p className="text-slate-500">Khấu hao bồi thường: <span className="font-bold text-slate-700">{(l.remainingValue || 0).toLocaleString()} VNĐ</span></p>
                      </div>
                      {l.compensationNote && <p className="text-[11px] bg-white border border-slate-200 p-2 rounded-lg text-slate-600 mt-2">Bồi hoàn: {l.compensationNote}</p>}
                      <p className="text-[9px] text-slate-400 font-bold mt-2 uppercase tracking-tight">
                        Ngày xảy ra: {new Date(l.reportedDate).toLocaleDateString('vi-VN')}
                      </p>
                    </div>
                  </div>
                ))}
                {(!tool.lostReports || tool.lostReports.length === 0) && (
                  <div className="text-center py-12 text-slate-400 space-y-1">
                    <ShieldAlert className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="text-xs font-bold">CCDC hoạt động bình thường, chưa bị báo mất.</p>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'inventory' && (
              <div className="space-y-4">
                {tool.inventoryItems?.map((item: any) => {
                  const isQty = tool.managementType === 'QUANTITY';
                  return (
                    <div key={item.id} className="flex gap-4 items-start bg-slate-50 p-5 rounded-2xl border border-slate-200/50 shadow-sm">
                      <ClipboardCheck className="h-6 w-6 text-orange-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-sm font-[850] text-slate-800">
                              Đợt kiểm kê: {item.inventoryCheck?.inventoryName || 'Định kỳ'}
                            </h4>
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">Mã đợt: {item.inventoryCheck?.inventoryCode}</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            item.result === 'MATCHED' ? 'bg-emerald-55 text-emerald-650' : 'bg-rose-55 text-rose-650'
                          }`}>{item.result === 'MATCHED' ? 'Khớp' : 'Sai lệch'}</span>
                        </div>

                        {isQty ? (
                          <div className="grid grid-cols-5 gap-2 bg-white p-3 rounded-xl border border-slate-200/60 mt-3 text-center">
                            <div>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sổ sách</p>
                              <p className="text-xs font-black text-slate-700 mt-0.5">{item.expectedQuantity}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Tốt</p>
                              <p className="text-xs font-black text-emerald-700 mt-0.5">{item.actualGoodQty}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Sửa</p>
                              <p className="text-xs font-black text-amber-700 mt-0.5">{item.actualRepairQty}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-rose-600 uppercase tracking-wider">Hủy</p>
                              <p className="text-xs font-black text-rose-700 mt-0.5">{item.actualBrokenQty}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold text-slate-550 uppercase tracking-wider">Mất</p>
                              <p className="text-xs font-black text-slate-700 mt-0.5">{item.actualLostQty}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 text-xs">
                            <span className="text-slate-500 font-semibold">Tình trạng ghi nhận: </span>
                            <span className="font-bold text-slate-800">{item.checkCondition === 'FOUND' ? 'Tìm thấy / Tốt' : item.checkCondition === 'DAMAGED' ? 'Hỏng hóc' : item.checkCondition === 'MISSING' ? 'Báo mất' : item.checkCondition || 'Khớp'}</span>
                          </div>
                        )}

                        {item.note && (
                          <p className="text-xs text-slate-650 mt-2 italic bg-white p-2.5 rounded-lg border border-slate-100">
                            &ldquo;{item.note}&rdquo;
                          </p>
                        )}

                        {item.photos && item.photos.length > 0 && (
                          <div className="flex gap-2 mt-3">
                            {item.photos.map((p: string, idx: number) => (
                              <a key={idx} href={p} target="_blank" rel="noreferrer">
                                <img src={p} alt="CCDC Evidence" className="w-12 h-12 rounded-lg object-cover border border-slate-200 hover:scale-105 transition-all shadow-sm" />
                              </a>
                            ))}
                          </div>
                        )}

                        <p className="text-[9px] text-slate-400 font-bold mt-3 uppercase tracking-wider">
                          Đã kiểm vào lúc {item.checkedAt ? new Date(item.checkedAt).toLocaleString('vi-VN') : '---'} bởi {item.checkedBy || '---'}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {(!tool.inventoryItems || tool.inventoryItems.length === 0) && (
                  <div className="text-center py-12 text-slate-400 space-y-1">
                    <ClipboardCheck className="h-8 w-8 mx-auto text-slate-350" />
                    <p className="text-xs font-bold">CCDC chưa từng được đưa vào đợt kiểm kê nào.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB: INVENTORY PHOTOS */}
            {activeTab === 'inventoryPhotos' && (
              <div className="space-y-4">
                {(() => {
                  const allPhotos = tool.inventoryItems?.reduce((acc: string[], item: any) => {
                    if (item.photos && Array.isArray(item.photos)) {
                      return [...acc, ...item.photos];
                    }
                    return acc;
                  }, []) || [];

                  if (allPhotos.length === 0) {
                    return (
                      <div className="text-center py-12 text-slate-400 space-y-1">
                        <ImageIcon className="h-8 w-8 mx-auto text-slate-350" />
                        <p className="text-xs font-bold">Chưa có ảnh bằng chứng kiểm kê nào được lưu.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {allPhotos.map((photo: string, index: number) => (
                        <a key={index} href={photo} target="_blank" rel="noreferrer" className="group block relative aspect-square rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm bg-slate-50">
                          <img src={photo} alt={`Evidence ${index}`} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-300" />
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                            <span className="text-white text-xs font-bold border border-white px-3 py-1.5 rounded-xl uppercase tracking-wider bg-black/20">Xem ảnh lớn</span>
                          </div>
                        </a>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* TAB: CCDC LIFECYCLE HISTORY */}
            {activeTab === 'lifecycle' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-primary-600" />
                      Lịch sử CCDC
                    </h3>
                    <p className="text-xs text-slate-500 font-semibold mt-1">
                      Tổng hợp các mốc nhập kho, điều chuyển, cấp phát, thu hồi, sửa chữa, kiểm kê và nhật ký hệ thống.
                    </p>
                  </div>
                  <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-black shrink-0">
                    {lifecycleEvents.length} sự kiện
                  </span>
                </div>

                {lifecycleEvents.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 space-y-1 border border-dashed border-slate-200 rounded-2xl bg-slate-50">
                    <Activity className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="text-xs font-bold">Chưa có lịch sử nghiệp vụ cho CCDC này.</p>
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                    {lifecycleEvents.map((event: any) => {
                      const toneClass =
                        event.tone === 'red' ? 'bg-red-50 border-red-200 text-red-700' :
                        event.tone === 'amber' || event.tone === 'orange' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                        event.tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                        event.tone === 'indigo' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                        event.tone === 'blue' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                        'bg-slate-50 border-slate-200 text-slate-700';

                      return (
                        <div key={event.id} className="relative">
                          <div className={`absolute -left-[22px] top-4 h-4 w-4 rounded-full border-2 border-white shadow-sm ${
                            event.tone === 'red' ? 'bg-red-500' :
                            event.tone === 'amber' || event.tone === 'orange' ? 'bg-amber-500' :
                            event.tone === 'emerald' ? 'bg-emerald-500' :
                            event.tone === 'indigo' ? 'bg-indigo-500' :
                            event.tone === 'blue' ? 'bg-blue-500' :
                            'bg-slate-400'
                          }`} />
                          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-slate-300 transition-colors">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${toneClass}`}>
                                    {event.type}
                                  </span>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    {event.source}
                                  </span>
                                </div>
                                <h4 className="text-sm font-black text-slate-850 mt-2">{event.title}</h4>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[11px] font-black text-slate-600">{new Date(event.date).toLocaleDateString('vi-VN')}</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{new Date(event.date).toLocaleTimeString('vi-VN')}</p>
                              </div>
                            </div>
                            {event.description && (
                              <p className="text-xs text-slate-600 font-semibold mt-3 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-3">
                                {event.description}
                              </p>
                            )}
                            {event.actor && (
                              <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-wider">
                                Người thực hiện / nguồn: {event.actor}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: SYSTEM HISTORIES LOG */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                {tool.histories?.map((h: any) => (
                  <div key={h.id} className="flex gap-4 items-start bg-slate-50 p-4 rounded-2xl border border-slate-200/50">
                    <Activity className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Hành động: {h.actionType}</h4>
                      <p className="text-xs text-slate-500 mt-1 font-semibold">
                        Trạng thái: [ {h.oldStatus || 'NONE'} ] &rarr; [ {h.newStatus || 'NONE'} ]
                      </p>
                      {h.oldNote && <p className="text-[11px] text-slate-600 mt-2 leading-relaxed bg-white p-2 rounded-lg border border-slate-200">{h.oldNote}</p>}
                      <p className="text-[9px] text-slate-400 font-bold mt-2 uppercase tracking-tight">
                        Lúc: {new Date(h.eventTime).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'invoice', title: 'Hóa đơn mua hàng', ok: !!tool.invoiceBatch, meta: tool.invoiceBatch ? `HĐ ${tool.invoiceBatch.invoiceNo}` : 'Chưa liên kết hóa đơn' },
                    { key: 'handover', title: 'Biên bản bàn giao', ok: handoverDocuments.length > 0 || (tool.assignments?.length || 0) > 0 || !!tool.handoverDate, meta: handoverDocuments.length > 0 ? `${handoverDocuments.length} biên bản` : `${tool.assignments?.length || 0} bản ghi cấp phát` },
                    { key: 'recall', title: 'Biên bản thu hồi', ok: recallDocuments.length > 0 || (tool.stockTransactions?.some((t: any) => t.type === 'RECALL') || false), meta: recallDocuments.length > 0 ? `${recallDocuments.length} biên bản` : `${tool.stockTransactions?.filter((t: any) => t.type === 'RECALL').length || 0} lần thu hồi` },
                    { key: 'damage', title: 'Biên bản báo hỏng', ok: (tool.repairTickets?.length || 0) > 0 || (tool.damageReports?.length || 0) > 0, meta: `${(tool.repairTickets?.length || 0) + (tool.damageReports?.length || 0)} hồ sơ` },
                    { key: 'lost', title: 'Biên bản mất', ok: (tool.lostReports?.length || 0) > 0, meta: `${tool.lostReports?.length || 0} hồ sơ` },
                    { key: 'liquidation', title: 'Biên bản hủy', ok: (tool.liquidations?.length || 0) > 0 || tool.status === 'LIQUIDATED', meta: `${tool.liquidations?.length || 0} hồ sơ thanh lý/hủy` }
                  ].map(doc => (
                    <div key={doc.key} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
                      {doc.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" /> : <AlertCircle className="h-5 w-5 text-slate-300 mt-0.5" />}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-black text-slate-800">{doc.title}</h4>
                        <p className="text-xs text-slate-500 font-bold mt-1">{doc.meta}</p>
                        {doc.key === 'handover' && handoverDocuments.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {handoverDocuments.map((handoverDocument: any) => (
                              <div key={handoverDocument.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-black text-slate-700">
                                    {handoverDocument.documentNo}
                                  </p>
                                  <p className="text-[10px] font-bold text-slate-400">
                                    {handoverTypeLabels[handoverDocument.type] || handoverDocument.type}
                                    {' · '}
                                    {new Date(handoverDocument.documentDate || handoverDocument.createdAt).toLocaleDateString('vi-VN')}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handlePrintHandoverDocument(handoverDocument.id)}
                                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-[10px] font-black uppercase text-primary-700 transition-colors hover:bg-primary-100"
                                >
                                  <Printer className="h-3.5 w-3.5" /> In biên bản
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {doc.key === 'handover' && doc.ok && handoverDocuments.length === 0 && (
                          <p className="mt-2 text-[10px] font-bold text-amber-600">Hồ sơ cũ chưa có tệp biên bản để in.</p>
                        )}
                        {doc.key === 'recall' && recallDocuments.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {recallDocuments.map((recallDocument: any) => (
                              <div key={recallDocument.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[11px] font-black text-slate-700">
                                    {recallDocument.documentNo}
                                  </p>
                                  <p className="text-[10px] font-bold text-slate-400">
                                    {new Date(recallDocument.documentDate || recallDocument.createdAt).toLocaleDateString('vi-VN')}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handlePrintHandoverDocument(recallDocument.id)}
                                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase text-amber-700 transition-colors hover:bg-amber-100"
                                >
                                  <Printer className="h-3.5 w-3.5" /> In biên bản
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {doc.key === 'recall' && doc.ok && recallDocuments.length === 0 && (
                          <p className="mt-2 text-[10px] font-bold text-amber-600">Dữ liệu thu hồi cũ chưa có biên bản để in.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {tool.invoiceBatch && (
                  <button
                    onClick={() => navigate(`/tools/invoices/${tool.invoiceBatch.id}`)}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-primary-50 border border-primary-200 rounded-xl text-xs font-black text-primary-700 hover:bg-primary-100"
                  >
                    <FileText className="h-4 w-4" /> Xem các món cùng hóa đơn
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 border border-slate-800 rounded-xl text-xs font-black text-white hover:bg-slate-900"
                >
                  <ClipboardList className="h-4 w-4" /> In lịch sử hồ sơ
                </button>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { label: 'Số lần sử dụng', value: `${usageCount} lần` },
                    { label: 'Số lần sửa', value: repairCount.toLocaleString('vi-VN') },
                    { label: 'Chi phí sửa', value: `${repairCost.toLocaleString('vi-VN')} VNĐ` },
                    { label: 'Tỷ lệ thất thoát', value: `${lossRate}%` },
                    { label: 'Lần kiểm kê cuối', value: lastInventoryDate ? new Date(lastInventoryDate).toLocaleDateString('vi-VN') : '---' },
                    { label: 'Tổng biến động kho', value: `${tool.stockTransactions?.length || 0} giao dịch` }
                  ].map(metric => (
                    <div key={metric.label} className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{metric.label}</p>
                      <p className="text-xl font-black text-slate-900 mt-2">{metric.value}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary-600" /> Tóm tắt quản lý
                  </h4>
                  <p className="text-sm text-slate-600 font-medium mt-3">
                    Hồ sơ hiện có {missingProfileItems.length === 0 ? 'đầy đủ các chứng từ chính.' : `còn thiếu ${missingProfileItems.join(', ')}.`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-5xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Settings className="h-4 w-4 text-primary-600" /> Chỉnh sửa thông tin CCDC
                </h3>
                <p className="text-xs text-slate-500 font-bold mt-1">Mọi thay đổi sẽ được ghi vào lịch sử hồ sơ.</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tên CCDC</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.toolName || ''} onChange={e => setEditForm({ ...editForm, toolName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhóm CCDC cấp 1</label>
                    <select
                      className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold"
                      value={editForm.category1 || ''}
                      onChange={e => setEditForm({
                        ...editForm,
                        category1: e.target.value,
                        category2: '',
                        category: buildToolCategory(e.target.value, '')
                      })}
                    >
                      <option value="">Chọn nhóm CCDC</option>
                      {Object.keys(TOOL_CATEGORY_TREE).map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhóm CCDC cấp 2</label>
                    <select
                      className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold"
                      value={editForm.category2 || ''}
                      disabled={!editForm.category1}
                      onChange={e => setEditForm({
                        ...editForm,
                        category2: e.target.value,
                        category: buildToolCategory(editForm.category1, e.target.value)
                      })}
                    >
                      <option value="">Không chọn</option>
                      {(TOOL_CATEGORY_TREE[editForm.category1] || []).map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
                    Mã CCDC hiện tại: <span className="font-black">{editForm.originalToolCode || tool.toolCode}</span>. Khi đổi nhóm, backend sẽ tự sinh mã CCDC cha mới và ghi lịch sử; mã con giữ nguyên.
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đơn vị tính</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.unit || ''} onChange={e => setEditForm({ ...editForm, unit: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đơn giá</label>
                    <input type="number" className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.purchasePrice || 0} onChange={e => setEditForm({ ...editForm, purchasePrice: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">VAT (%)</label>
                    <input type="number" className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.vat || 0} onChange={e => setEditForm({ ...editForm, vat: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chi phí vận chuyển</label>
                    <input type="number" className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.shippingInstallCost || 0} onChange={e => setEditForm({ ...editForm, shippingInstallCost: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng giá trị</label>
                    <input type="number" className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.totalAmount || 0} onChange={e => setEditForm({ ...editForm, totalAmount: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ngày mua</label>
                    <input type="date" className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.purchaseDate || ''} onChange={e => setEditForm({ ...editForm, purchaseDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhà cung cấp</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.supplierName || ''} onChange={e => setEditForm({ ...editForm, supplierName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Người sử dụng</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.currentUserName || ''} onChange={e => setEditForm({ ...editForm, currentUserName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bộ phận sử dụng</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.departmentName || ''} onChange={e => setEditForm({ ...editForm, departmentName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Công ty</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.companyName || ''} onChange={e => setEditForm({ ...editForm, companyName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chi nhánh</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.branchName || ''} onChange={e => setEditForm({ ...editForm, branchName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tòa nhà / Dự án</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.buildingName || ''} onChange={e => setEditForm({ ...editForm, buildingName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tầng / Vị trí</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.floorName || ''} onChange={e => setEditForm({ ...editForm, floorName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Khu vực / Phòng</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.areaName || ''} onChange={e => setEditForm({ ...editForm, areaName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vị trí chi tiết</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.specificLocation || ''} onChange={e => setEditForm({ ...editForm, specificLocation: e.target.value })} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tình trạng ban đầu</label>
                    <textarea className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold min-h-[76px]" value={editForm.initialCondition || ''} onChange={e => setEditForm({ ...editForm, initialCondition: e.target.value })} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú</label>
                    <textarea className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold min-h-[90px]" value={editForm.note || ''} onChange={e => setEditForm({ ...editForm, note: e.target.value })} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lý do cập nhật / log</label>
                    <input className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-sm font-semibold" value={editForm.reason || ''} onChange={e => setEditForm({ ...editForm, reason: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold transition-colors">Lưu thay đổi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- QUANTITY DYNAMIC TRANSACTION MODALS --- */}

      {/* A. TRANSFER MODAL */}
      {activeStockModal === 'TRANSFER' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <ArrowRightLeft className="h-4 w-4 text-blue-500" /> Điều chuyển số lượng
              </h3>
              <button onClick={() => setActiveStockModal('NONE')} className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => handleStockSubmit(e, 'transfer', transferForm)}>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Từ vị trí nguồn *</label>
                  <select 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={transferForm.fromLocation}
                    onChange={e => setTransferForm({ ...transferForm, fromLocation: e.target.value })}
                  >
                    {tool.stocks?.filter((s: any) => s.quantityAvailable > 0).map((s: any) => (
                      <option key={s.id} value={s.locationName}>{s.locationName} (Có sẵn: {s.quantityAvailable})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số lượng cần chuyển *</label>
                  <input 
                    type="number" 
                    min={1} 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                    value={transferForm.quantity}
                    onChange={e => setTransferForm({ ...transferForm, quantity: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đến vị trí đích *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Tên kho / Vị trí đích..."
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={transferForm.toLocation}
                    onChange={e => setTransferForm({ ...transferForm, toLocation: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú điều chuyển</label>
                  <textarea 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold h-16"
                    value={transferForm.note}
                    onChange={e => setTransferForm({ ...transferForm, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setActiveStockModal('NONE')} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors">Điều chuyển</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* B. ALLOCATE (USE) MODAL */}
      {activeStockModal === 'ALLOCATE' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <User className="h-4 w-4 text-green-500" /> Cấp phát / Bàn giao sử dụng
              </h3>
              <button onClick={() => setActiveStockModal('NONE')} className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => handleStockSubmit(e, 'use', allocateForm)}>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Từ vị trí nguồn *</label>
                  <select 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={allocateForm.fromLocation}
                    onChange={e => setAllocateForm({ ...allocateForm, fromLocation: e.target.value })}
                  >
                    {tool.stocks?.filter((s: any) => s.quantityAvailable > 0).map((s: any) => (
                      <option key={s.id} value={s.locationName}>{s.locationName} (Có sẵn: {s.quantityAvailable})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số lượng cấp phát *</label>
                  <input 
                    type="number" 
                    min={1} 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                    value={allocateForm.quantity}
                    onChange={e => setAllocateForm({ ...allocateForm, quantity: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đến địa điểm sử dụng (Sự kiện / Dự án / Phòng ban) *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Ví dụ: Event A, Phòng Marketing..."
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={allocateForm.toLocation}
                    onChange={e => setAllocateForm({ ...allocateForm, toLocation: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú cấp phát</label>
                  <textarea 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold h-16"
                    value={allocateForm.note}
                    onChange={e => setAllocateForm({ ...allocateForm, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setActiveStockModal('NONE')} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-colors">Cấp phát sử dụng</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* C. RECALL MODAL */}
      {activeStockModal === 'RECALL' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <Box className="h-4 w-4 text-amber-500" /> Thu hồi sau sử dụng
              </h3>
              <button onClick={() => setActiveStockModal('NONE')} className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => handleStockSubmit(e, 'recall', recallForm)}>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thu hồi từ địa điểm sử dụng *</label>
                  <select 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={recallForm.fromLocation}
                    onChange={e => setRecallForm({ ...recallForm, fromLocation: e.target.value })}
                  >
                    {tool.stocks?.filter((s: any) => s.quantityUsing > 0).map((s: any) => (
                      <option key={s.id} value={s.locationName}>{s.locationName} (Đang dùng: {s.quantityUsing})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tổng số lượng thu hồi *</label>
                  <input 
                    type="number" 
                    min={1} 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                    value={recallForm.quantity}
                    onChange={e => setRecallForm({ ...recallForm, quantity: Number(e.target.value) || 1, qtyGood: Number(e.target.value) || 1, qtyRepair: 0, qtyBroken: 0, qtyLost: 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thu hồi về vị trí / Kho *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Vị trí kho lưu trữ..."
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={recallForm.toLocation}
                    onChange={e => setRecallForm({ ...recallForm, toLocation: e.target.value })}
                  />
                </div>

                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chi tiết phân loại sức khỏe thu hồi</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[9px] font-bold text-green-600 uppercase">Tốt (Có sẵn)</label>
                      <input 
                        type="number" 
                        min={0}
                        className="w-full bg-white border rounded-lg px-2 py-1 text-xs text-center font-bold text-green-700"
                        value={recallForm.qtyGood}
                        onChange={e => setRecallForm({ ...recallForm, qtyGood: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[9px] font-bold text-amber-600 uppercase">Hỏng (Sửa)</label>
                      <input 
                        type="number" 
                        min={0}
                        className="w-full bg-white border rounded-lg px-2 py-1 text-xs text-center font-bold text-amber-700"
                        value={recallForm.qtyRepair}
                        onChange={e => setRecallForm({ ...recallForm, qtyRepair: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[9px] font-bold text-red-600 uppercase">Bị mất</label>
                      <input 
                        type="number" 
                        min={0}
                        className="w-full bg-white border rounded-lg px-2 py-1 text-xs text-center font-bold text-red-700"
                        value={recallForm.qtyLost}
                        onChange={e => setRecallForm({ ...recallForm, qtyLost: Number(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  {recallForm.qtyGood + recallForm.qtyRepair + recallForm.qtyBroken + recallForm.qtyLost !== recallForm.quantity && (
                    <p className="text-[10px] text-red-500 font-bold">Lưu ý: Tổng chi tiết ({recallForm.qtyGood + recallForm.qtyRepair + recallForm.qtyBroken + recallForm.qtyLost}) khác tổng số lượng yêu cầu ({recallForm.quantity}).</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú thu hồi</label>
                  <textarea 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold h-16"
                    value={recallForm.note}
                    onChange={e => setRecallForm({ ...recallForm, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setActiveStockModal('NONE')} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" disabled={recallForm.qtyGood + recallForm.qtyRepair + recallForm.qtyBroken + recallForm.qtyLost !== recallForm.quantity} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50">Xác nhận thu hồi &amp; tạo biên bản</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* D. DAMAGE MODAL */}
      {activeStockModal === 'DAMAGE' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-red-500" /> Báo hỏng số lượng CCDC
              </h3>
              <button onClick={() => setActiveStockModal('NONE')} className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => handleStockSubmit(e, 'damage', damageForm)}>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vị trí xảy ra hỏng hóc *</label>
                  <select 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={damageForm.locationName}
                    onChange={e => setDamageForm({ ...damageForm, locationName: e.target.value })}
                  >
                    {tool.stocks?.filter((s: any) => s.quantityAvailable > 0).map((s: any) => (
                      <option key={s.id} value={s.locationName}>{s.locationName} (Có sẵn: {s.quantityAvailable})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số lượng báo hỏng *</label>
                  <input 
                    type="number" 
                    min={1} 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                    value={damageForm.quantity}
                    onChange={e => setDamageForm({ ...damageForm, quantity: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-slate-500 text-xs font-bold uppercase tracking-wider">Phương án xử lý</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDamageForm({ ...damageForm, canRepair: true })}
                      className={`flex flex-col items-center py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all ${
                        damageForm.canRepair
                          ? 'bg-teal-50 border-teal-400 text-teal-700 shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-lg mb-1">🔧</span>
                      <span>Sửa chữa</span>
                      <span className="text-[9px] font-normal mt-0.5 opacity-70">Chuyển sang "Đang sửa"</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDamageForm({ ...damageForm, canRepair: false })}
                      className={`flex flex-col items-center py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all ${
                        !damageForm.canRepair
                          ? 'bg-red-50 border-red-400 text-red-700 shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-lg mb-1">🚫</span>
                      <span>Đề xuất hủy</span>
                      <span className="text-[9px] font-normal mt-0.5 opacity-70">Chuyển sang "Chờ hủy"</span>
                    </button>
                  </div>
                  {!damageForm.canRepair && (
                    <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ⚠️ Đề xuất hủy sẽ được gửi lên màn hình <strong>Chờ xử lý</strong> để Admin phê duyệt trước khi chính thức hủy.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lý do hư hỏng / Ghi chú</label>
                  <textarea 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold h-16"
                    value={damageForm.note}
                    onChange={e => setDamageForm({ ...damageForm, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setActiveStockModal('NONE')} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" className={`px-5 py-2 text-white rounded-xl text-xs font-bold transition-colors ${
                  damageForm.canRepair
                    ? 'bg-teal-600 hover:bg-teal-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}>
                  {damageForm.canRepair ? 'Gửi sửa chữa' : 'Đề xuất hủy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* E. REPAIR COMPLETE MODAL */}
      {activeStockModal === 'REPAIR_COMPLETE' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-teal-500" /> Xác nhận CCDC sửa chữa hoàn thành
              </h3>
              <button onClick={() => setActiveStockModal('NONE')} className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => handleStockSubmit(e, 'repair-complete', repairCompleteForm)}>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chọn địa điểm sửa xong *</label>
                  <select 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={repairCompleteForm.locationName}
                    onChange={e => setRepairCompleteForm({ ...repairCompleteForm, locationName: e.target.value })}
                  >
                    {tool.stocks?.filter((s: any) => s.quantityRepairing > 0).map((s: any) => (
                      <option key={s.id} value={s.locationName}>{s.locationName} (Đang sửa: {s.quantityRepairing})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số lượng đã sửa xong *</label>
                  <input 
                    type="number" 
                    min={1} 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                    value={repairCompleteForm.quantity}
                    onChange={e => setRepairCompleteForm({ ...repairCompleteForm, quantity: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chi phí sửa thực tế (VNĐ)</label>
                  <input 
                    type="number" 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                    value={repairCompleteForm.actualCost}
                    onChange={e => setRepairCompleteForm({ ...repairCompleteForm, actualCost: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú sửa chữa</label>
                  <textarea 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold h-16"
                    value={repairCompleteForm.note}
                    onChange={e => setRepairCompleteForm({ ...repairCompleteForm, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setActiveStockModal('NONE')} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors">Hoàn tất sửa</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeStockModal === 'LOST_FOUND' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Xác nhận đã tìm lại CCDC
              </h3>
              <button onClick={() => setActiveStockModal('NONE')} className="p-1 text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => handleStockSubmit(e, 'lost-found', lostFoundForm)}>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vị trí tìm lại *</label>
                  <select required className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold" value={lostFoundForm.locationName} onChange={e => setLostFoundForm({ ...lostFoundForm, locationName: e.target.value })}>
                    {tool.stocks?.filter((s: any) => s.quantityLost > 0).map((s: any) => (
                      <option key={s.id} value={s.locationName}>{s.locationName} (Đang mất: {s.quantityLost})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số lượng tìm lại *</label>
                  <input type="number" min={1} required className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold" value={lostFoundForm.quantity} onChange={e => setLostFoundForm({ ...lostFoundForm, quantity: Number(e.target.value) || 1 })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú</label>
                  <textarea className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold h-16" value={lostFoundForm.note} onChange={e => setLostFoundForm({ ...lostFoundForm, note: e.target.value })} />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setActiveStockModal('NONE')} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold">Xác nhận tìm lại</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* F. LOST MODAL */}
      {activeStockModal === 'LOST' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-orange-500" /> Báo mất / Thất thoát CCDC
              </h3>
              <button onClick={() => setActiveStockModal('NONE')} className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => handleStockSubmit(e, 'lost', lostForm)}>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chọn địa điểm xảy ra mất *</label>
                  <select 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={lostForm.locationName}
                    onChange={e => setLostForm({ ...lostForm, locationName: e.target.value })}
                  >
                    {tool.stocks?.filter((s: any) => s.quantityAvailable > 0).map((s: any) => (
                      <option key={s.id} value={s.locationName}>{s.locationName} (Có sẵn: {s.quantityAvailable})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số lượng báo mất *</label>
                  <input 
                    type="number" 
                    min={1} 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                    value={lostForm.quantity}
                    onChange={e => setLostForm({ ...lostForm, quantity: Number(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhân sự chịu trách nhiệm bồi thường</label>
                  <input 
                    type="text" 
                    placeholder="Họ tên nhân viên chịu trách nhiệm..."
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={lostForm.responsibleUser}
                    onChange={e => setLostForm({ ...lostForm, responsibleUser: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Giá trị khấu hao (VNĐ)</label>
                    <input 
                      type="number" 
                      className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                      value={lostForm.compensationValue}
                      onChange={e => setLostForm({ ...lostForm, compensationValue: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số biên bản bồi hoàn</label>
                    <input 
                      type="text" 
                      placeholder="BB-00001..."
                      className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                      value={lostForm.documentNo}
                      onChange={e => setLostForm({ ...lostForm, documentNo: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú sự việc</label>
                  <textarea 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold h-16"
                    value={lostForm.note}
                    onChange={e => setLostForm({ ...lostForm, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setActiveStockModal('NONE')} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-colors">Xác nhận báo mất</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* G. BATCH (IMPORT NEW BATCH) MODAL */}
      {activeStockModal === 'BATCH' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-indigo-500" /> Nhập thêm lô hàng mới (Tách lô)
              </h3>
              <button onClick={() => setActiveStockModal('NONE')} className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => handleStockSubmit(e, 'batch', batchForm)}>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số lượng nhập lô *</label>
                    <input 
                      type="number" 
                      min={1} 
                      required 
                      className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                      value={batchForm.quantity}
                      onChange={e => setBatchForm({ ...batchForm, quantity: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đơn giá lô này (VNĐ) *</label>
                    <input 
                      type="number" 
                      required 
                      className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                      value={batchForm.purchasePrice}
                      onChange={e => setBatchForm({ ...batchForm, purchasePrice: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ngày nhập lô *</label>
                    <input 
                      type="date" 
                      required 
                      className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                      value={batchForm.purchaseDate}
                      onChange={e => setBatchForm({ ...batchForm, purchaseDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhà cung cấp lô này</label>
                    <input 
                      type="text" 
                      placeholder="NCC mới..."
                      className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                      value={batchForm.supplierName}
                      onChange={e => setBatchForm({ ...batchForm, supplierName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kho / Vị trí nhận lô hàng này *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Tên kho lưu trữ..."
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={batchForm.locationName}
                    onChange={e => setBatchForm({ ...batchForm, locationName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú lô hàng</label>
                  <textarea 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold h-16"
                    value={batchForm.note}
                    onChange={e => setBatchForm({ ...batchForm, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setActiveStockModal('NONE')} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors">Nhập lô hàng</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* H. ADJUST STOCK MODAL */}
      {activeStockModal === 'ADJUST' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                <ClipboardCheck className="h-4 w-4 text-slate-650" /> Kiểm kê tồn kho số lượng
              </h3>
              <button onClick={() => setActiveStockModal('NONE')} className="p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={(e) => handleStockSubmit(e, 'adjust', adjustForm)}>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chọn địa điểm kiểm kê *</label>
                  <select 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={adjustForm.locationName}
                    onChange={e => {
                      const selLoc = e.target.value;
                      const selQty = tool.stocks?.find((s: any) => s.locationName === selLoc)?.quantityAvailable || 0;
                      setAdjustForm({ ...adjustForm, locationName: selLoc, actualQuantity: selQty });
                    }}
                  >
                    {tool.stocks?.map((s: any) => (
                      <option key={s.id} value={s.locationName}>{s.locationName} (Sổ sách: {s.quantityAvailable})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Số lượng kiểm thực tế *</label>
                  <input 
                    type="number" 
                    min={0} 
                    required 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold"
                    value={adjustForm.actualQuantity}
                    onChange={e => setAdjustForm({ ...adjustForm, actualQuantity: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phương án xử lý nếu chênh lệch thiếu</label>
                  <select 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-xs font-semibold"
                    value={adjustForm.action}
                    onChange={e => setAdjustForm({ ...adjustForm, action: e.target.value as any })}
                  >
                    <option value="ADJUST_STOCK">Tự động điều chỉnh tồn khả dụng khớp thực tế</option>
                    <option value="RECORD_LOST">Ghi nhận số lượng chênh lệch vào Thất thoát/Mất</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ghi chú kiểm kê / Lý do chênh lệch</label>
                  <textarea 
                    className="w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs font-semibold h-16"
                    value={adjustForm.note}
                    onChange={e => setAdjustForm({ ...adjustForm, note: e.target.value })}
                  />
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setActiveStockModal('NONE')} className="px-4 py-2 border rounded-xl text-xs font-bold bg-white text-slate-700">Hủy</button>
                <button type="submit" className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors">Xác nhận điều chỉnh</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
