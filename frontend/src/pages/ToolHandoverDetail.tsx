import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { 
  ChevronLeft, 
  Printer, 
  User, 
  PenTool, 
  Loader2, 
  Check, 
  Upload, 
  Save,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';

export const ToolHandoverDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Drawing Pad states
  const [signingRole, setSigningRole] = useState<'SENDER' | 'RECIPIENT' | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const fetchDetail = async () => {
    try {
      const res = await api.get(`/tools/handover/${id}`);
      setDoc(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Không thể tải chi tiết biên bản bàn giao");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000000';

    const rect = canvas.getBoundingClientRect();
    let x = 0;
    let y = 0;

    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let x = 0;
    let y = 0;

    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const uploadSignatureToCloudinary = async (dataUrl: string) => {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], "signature.png", { type: "image/png" });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ccdcdanko');

    const res = await fetch('https://api.cloudinary.com/v1_1/drjajjthw/image/upload', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error('Failed to upload signature image');
    const data = await res.json();
    return data.secure_url;
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !signingRole) return;
    
    setSubmitting(true);
    try {
      const dataUrl = canvas.toDataURL();
      const imageUrl = await uploadSignatureToCloudinary(dataUrl);

      // Save to database
      const field = signingRole === 'SENDER' ? 'senderSignature' : 'recipientSignature';
      await api.put(`/tools/handover/${id}`, {
        [field]: imageUrl,
        // Automatically mark as COMPLETED if recipient signs or completed
        status: signingRole === 'RECIPIENT' ? 'COMPLETED' : undefined
      });

      toast.success("Đã lưu chữ ký điện tử thành công");
      setSigningRole(null);
      fetchDetail();
    } catch (err) {
      console.error(err);
      toast.error("Lỗi khi lưu chữ ký điện tử");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    const token = localStorage.getItem('token') || '';
    const printUrl = `${api.defaults.baseURL}/tools/handover/${id}/pdf?token=${encodeURIComponent(token)}`;
    const printWindow = window.open(printUrl, '_blank');
    if (!printWindow) {
      toast.error('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép popup.');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 className="h-10 w-10 text-orange-600 animate-spin" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center p-20 text-slate-500 font-bold">
        Không tìm thấy biên bản bàn giao.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 print:p-0 print:m-0 print:max-w-full">
      {/* HEADER ACTION (HIDDEN IN PRINT) */}
      <div className="flex items-center justify-between gap-6 print:hidden">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all border-0 cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-[900] text-[#0F172A] tracking-tight">Chi tiết Biên bản Bàn giao</h1>
            <p className="text-slate-500 text-xs font-mono">{doc.documentNo}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={handlePrint}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all border-0 cursor-pointer flex items-center shadow-md"
          >
            <Printer className="h-4 w-4 mr-1.5" /> In Biên bản
          </button>
        </div>
      </div>

      {/* PRINTABLE A4 BIÊN BẢN */}
      <div className="bg-white p-12 rounded-3xl border border-slate-250/70 shadow-sm space-y-8 print:border-0 print:p-0 print:shadow-none font-serif text-slate-900 leading-relaxed">
        
        {/* BBBG HEADER */}
        <div className="text-center space-y-2">
          <h2 className="text-lg font-black uppercase tracking-wide">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h2>
          <p className="text-sm font-bold underline decoration-1 underline-offset-4">Độc lập - Tự do - Hạnh phúc</p>
          <div className="pt-6 pb-2">
            <h3 className="text-2xl font-[900] uppercase tracking-wider">BIÊN BẢN BÀN GIAO CÔNG CỤ DỤNG CỤ</h3>
            <p className="text-xs italic text-slate-500 font-sans print:text-slate-850 mt-1">Số: {doc.documentNo} / Ngày lập: {format(new Date(doc.documentDate), 'dd/MM/yyyy')}</p>
          </div>
        </div>

        {/* BBBG MEMBERS */}
        <div className="space-y-6 text-sm font-medium">
          <p className="italic">Hôm nay, ngày {format(new Date(doc.documentDate), 'dd')} tháng {format(new Date(doc.documentDate), 'MM')} năm {format(new Date(doc.documentDate), 'yyyy')}, chúng tôi gồm:</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans text-xs">
            {/* SENDER */}
            <div className="space-y-2 bg-slate-50 p-5 rounded-2xl border border-slate-200/60 print:bg-white print:p-0 print:border-0">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 print:text-black">A. BÊN GIAO (Bàn giao)</h4>
              <p>Họ và tên: <strong>{doc.senderName || '---'}</strong></p>
              <p>Phòng ban/Kho: <strong>{doc.senderDepartment || 'Ban quản trị hành chính'}</strong></p>
              <p>Chức vụ: <strong>{doc.senderPosition || 'Thủ kho'}</strong></p>
            </div>

            {/* RECEIVER */}
            <div className="space-y-2 bg-slate-50 p-5 rounded-2xl border border-slate-200/60 print:bg-white print:p-0 print:border-0">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 print:text-black">B. BÊN NHẬN (Sử dụng)</h4>
              <p>Họ và tên: <strong>{doc.recipientName}</strong></p>
              <p>Bộ phận sử dụng: <strong>{doc.recipientDepartment || '---'}</strong></p>
              <p>Chức vụ: <strong>{doc.recipientPosition || 'Nhân viên'}</strong></p>
              <p>Số điện thoại: <strong>{doc.recipientPhone || '---'}</strong></p>
            </div>
          </div>

          {doc.reason && (
            <p><strong>Lý do bàn giao: </strong>{doc.reason}</p>
          )}
        </div>

        {/* ITEMS TABLE */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold uppercase">C. Danh sách CCDC bàn giao</h4>
          <table className="w-full text-left border-collapse text-xs border border-slate-300">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-300 font-bold">
                <th className="p-3 border-r border-slate-300 w-12 text-center">STT</th>
                <th className="p-3 border-r border-slate-300">Mã CCDC</th>
                <th className="p-3 border-r border-slate-300">Tên CCDC</th>
                <th className="p-3 border-r border-slate-300 text-center w-20">Số lượng</th>
                <th className="p-3 border-r border-slate-300 text-center w-20">Đơn vị</th>
                <th className="p-3 text-center">Tình trạng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {doc.items?.map((item: any, index: number) => (
                <tr key={item.id}>
                  <td className="p-3 border-r border-slate-300 text-center font-bold">{index + 1}</td>
                  <td className="p-3 border-r border-slate-300 font-mono">{item.toolCode}</td>
                  <td className="p-3 border-r border-slate-300 font-bold">{item.toolName}</td>
                  <td className="p-3 border-r border-slate-300 text-center font-bold">{item.tool?.quantity || 1}</td>
                  <td className="p-3 border-r border-slate-300 text-center">{item.unit || 'Cái'}</td>
                  <td className="p-3 text-center font-semibold text-emerald-600">Mới 100% / Tốt</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* COMMITMENT */}
        <div className="space-y-2 text-xs italic text-slate-650 font-sans print:text-black">
          <p>Bên nhận cam kết bảo quản CCDC đúng tiêu chuẩn, sử dụng đúng mục đích công việc. Trong trường hợp xảy ra mất mát, hỏng hóc do bất cẩn, Bên nhận chịu hoàn toàn trách nhiệm bồi hoàn theo quy định của công ty.</p>
        </div>

        {/* SIGNATURES BLOCK */}
        <div className="grid grid-cols-2 gap-8 text-center pt-8 font-sans">
          {/* SENDER SIGN */}
          <div className="space-y-4">
            <h5 className="font-bold text-xs uppercase tracking-wider">Đại diện bên giao</h5>
            <p className="text-[10px] text-slate-400 italic print:hidden">(Ký ghi rõ họ tên)</p>
            
            <div className="h-32 border border-dashed border-slate-200 rounded-2xl flex items-center justify-center bg-slate-50/50 relative overflow-hidden print:border-0 print:bg-white print:h-20">
              {doc.senderSignature ? (
                <img src={doc.senderSignature} alt="Sender Signature" className="max-h-full object-contain" />
              ) : (
                <button 
                  onClick={() => setSigningRole('SENDER')}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1.5 print:hidden"
                >
                  <PenTool className="h-3.5 w-3.5 text-orange-600" /> Ký điện tử
                </button>
              )}
            </div>
            <p className="font-extrabold text-sm text-slate-800">{doc.senderName || '---'}</p>
          </div>

          {/* RECIPIENT SIGN */}
          <div className="space-y-4">
            <h5 className="font-bold text-xs uppercase tracking-wider">Đại diện bên nhận</h5>
            <p className="text-[10px] text-slate-400 italic print:hidden">(Ký ghi rõ họ tên)</p>
            
            <div className="h-32 border border-dashed border-slate-200 rounded-2xl flex items-center justify-center bg-slate-50/50 relative overflow-hidden print:border-0 print:bg-white print:h-20">
              {doc.recipientSignature ? (
                <img src={doc.recipientSignature} alt="Recipient Signature" className="max-h-full object-contain" />
              ) : (
                <button 
                  onClick={() => setSigningRole('RECIPIENT')}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1.5 print:hidden"
                >
                  <PenTool className="h-3.5 w-3.5 text-orange-600" /> Ký điện tử
                </button>
              )}
            </div>
            <p className="font-extrabold text-sm text-slate-800">{doc.recipientName}</p>
          </div>
        </div>

      </div>

      {/* DRAWING SIGNATURE MODAL */}
      {signingRole && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <PenTool className="h-5 w-5 text-orange-600" />
                <h3 className="text-sm font-[900] text-slate-850">
                  {signingRole === 'SENDER' ? 'Bên Giao Ký Xác Nhận' : 'Bên Nhận Ký Xác Nhận'}
                </h3>
              </div>
              <button onClick={() => setSigningRole(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 border-0 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl overflow-hidden cursor-crosshair">
                <canvas 
                  ref={canvasRef}
                  width="400"
                  height="200"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full bg-slate-50"
                />
              </div>

              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                <span>Vui lòng vẽ chữ ký của bạn vào khung phía trên.</span>
                <button type="button" onClick={clearCanvas} className="text-rose-600 bg-transparent border-0 cursor-pointer hover:underline">Xóa nét vẽ</button>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setSigningRole(null)}
                  className="flex-1 bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button 
                  type="button" 
                  onClick={saveSignature}
                  disabled={submitting}
                  className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center justify-center"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lưu chữ ký"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
