import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Minus, Plus, Printer, X } from 'lucide-react';
import dankoGroupLogo from '../assets/danko-group-logo.png';

type Asset = Record<string, any>;

interface Props {
  assets: Asset[];
  onClose: () => void;
}

const liquidationTypeLabel = (type?: string) => ({
  SELL: 'Bán thanh lý',
  DISPOSE: 'Hủy / bỏ',
  DONATE: 'Cho tặng',
  RETURN_SUPPLIER: 'Trả nhà cung cấp',
  SCRAP: 'Bán phế liệu'
}[String(type || '')] || '');

const asDateInput = (value?: string | Date | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const formatDate = (value?: string) => {
  if (!value) return '...... / ...... / 20......';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '...... / ...... / 20......' : `${String(date.getDate()).padStart(2, '0')} / ${String(date.getMonth() + 1).padStart(2, '0')} / ${date.getFullYear()}`;
};

const formatMoney = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('vi-VN') : '';
};

const printableCondition = (value: unknown) => {
  const condition = String(value || '').trim();
  return condition.toUpperCase() === 'MISSING' ? 'Tài sản không thể tiếp tục sử dụng' : condition;
};

const technicalDescription = (asset: Asset) => {
  const raw = asset.technicalSpecsJson;
  if (!raw) return asset.assetName || '';
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const specification = Array.isArray(value)
      ? value.filter(Boolean).join(', ')
      : typeof value === 'object'
        ? Object.values(value).filter((item) => item !== null && item !== undefined && String(item).trim()).join(', ')
        : String(value);
    return specification ? `${asset.assetName || ''}\n${specification}`.trim() : asset.assetName || '';
  } catch {
    return `${asset.assetName || ''}\n${String(raw)}`.trim();
  }
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const LiquidationMinutesModal: React.FC<Props> = ({ assets, onClose }) => {
  const record = assets[0]?.liquidationRecord;
  const [template, setTemplate] = useState<'LIQUIDATION' | 'DESTRUCTION'>(record?.liquidationType === 'DISPOSE' ? 'DESTRUCTION' : 'LIQUIDATION');
  const isDestruction = template === 'DESTRUCTION';
  const [documentNo, setDocumentNo] = useState(record?.liquidationCode || '');
  const [documentDate, setDocumentDate] = useState(asDateInput(record?.liquidationDate));
  const [location, setLocation] = useState(assets[0]?.locationName || '');
  const [attendees, setAttendees] = useState([
    { name: '', department: '' },
    { name: '', department: '' },
    { name: '', department: '' }
  ]);
  const [method, setMethod] = useState(liquidationTypeLabel(record?.liquidationType));
  const [liquidationCost, setLiquidationCost] = useState('');
  const [recoveryValue, setRecoveryValue] = useState('');
  const [conclusion, setConclusion] = useState('');

  useEffect(() => {
    const minimumAttendees = isDestruction ? 4 : 3;
    setAttendees((current) => current.length >= minimumAttendees
      ? current
      : [...current, ...Array.from({ length: minimumAttendees - current.length }, () => ({ name: '', department: '' }))]);
  }, [isDestruction]);

  const preparedAssets: Asset[] = useMemo(() => {
    const uniqueAssets = new Map<string, Asset>();
    assets.forEach((asset) => {
      const key = String(asset.assetCode || `asset-${asset.id || uniqueAssets.size}`).trim();
      if (!uniqueAssets.has(key)) uniqueAssets.set(key, asset);
    });
    return Array.from(uniqueAssets.values()).map((asset) => ({
      ...asset,
      description: technicalDescription(asset),
      yearInUse: asset.handoverDate ? new Date(asset.handoverDate).getFullYear() : '',
      remainingValue: asset.financeProfile?.remainingValue,
      actualCondition: printableCondition(asset.lastInventoryStatus),
      note: asset.liquidationRecord?.note || asset.liquidationRecord?.reason || ''
    }));
  }, [assets]);

  const sourceDocumentNos = useMemo(() => Array.from(new Set(assets
    .map((asset) => asset.liquidationRecord?.liquidationCode || asset.liquidationRecord?.documentNo)
    .filter(Boolean))), [assets]);

  const updateAttendee = (index: number, field: 'name' | 'department', value: string) => {
    setAttendees((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };

  const addAttendee = () => setAttendees((current) => [...current, { name: '', department: '' }]);
  const removeAttendee = () => {
    const minimumAttendees = isDestruction ? 4 : 3;
    setAttendees((current) => current.length > minimumAttendees ? current.slice(0, -1) : current);
  };

  const openPrintWindow = () => {
    const logoUrl = new URL(dankoGroupLogo, window.location.origin).href;
    const displayedAttendees = attendees;
    const rows = preparedAssets.map((asset, index) => isDestruction ? `
      <tr>
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(asset.assetCode)}</td>
        <td>${escapeHtml(asset.description).replace(/\n/g, '<br>')}</td>
        <td>${escapeHtml(asset.departmentName || asset.department || '')}</td>
        <td>${escapeHtml(asset.actualCondition)}</td>
        <td>${escapeHtml(asset.note)}</td>
      </tr>` : `
      <tr>
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(asset.assetCode)}</td>
        <td>${escapeHtml(asset.description).replace(/\n/g, '<br>')}</td>
        <td class="center">${escapeHtml(asset.yearInUse)}</td>
        <td class="money">${escapeHtml(formatMoney(asset.purchasePriceExVat))}</td>
        <td class="money">${escapeHtml(formatMoney(asset.remainingValue))}</td>
        <td>${escapeHtml(asset.actualCondition)}</td>
        <td>${escapeHtml(asset.note)}</td>
      </tr>`).join('');
    const attendeeLines = displayedAttendees.map((attendee, index) => `${index + 1}. Ông/Bà: ${escapeHtml(attendee.name || '................................')} <span class="department">Phòng ban/bộ phận: ${escapeHtml(attendee.department || '................................')}</span>`).join('<br>');
    const documentTitle = isDestruction ? 'BIÊN BẢN TIÊU HỦY' : 'BIÊN BẢN THANH LÝ TÀI SẢN';
    const documentSubTitle = isDestruction ? 'Tài sản không còn giá trị sử dụng' : '';
    const formNo = isDestruction ? 'BM05/QLTS' : 'BM04/QLTS';
    const tableHeader = isDestruction
      ? '<tr><th style="width:6%">STT</th><th style="width:16%">Mã tài sản</th><th style="width:30%">Mô tả kỹ thuật</th><th style="width:17%">Phòng/Ban</th><th style="width:16%">Tình trạng</th><th style="width:15%">Ghi chú</th></tr>'
      : '<tr><th style="width:5%">STT</th><th style="width:12%">Mã tài sản</th><th style="width:27%">Mô tả kỹ thuật</th><th style="width:8%">Năm sử dụng</th><th style="width:13%">Nguyên giá</th><th style="width:13%">Khấu hao còn lại</th><th style="width:11%">Tình trạng</th><th style="width:11%">Ghi chú</th></tr>';
    const postContent = isDestruction
      ? `<div class="post"><p class="section">II. Kết luận của tài sản:</p><p class="line">${escapeHtml(conclusion)}</p></div>`
      : `<div class="post"><p class="section">II. Hình thức thanh lý:</p><p class="line">${escapeHtml(method)}</p><p class="section">III. Kết quả thanh lý TSCĐ:</p><p class="line">- Chi phí thanh lý TSCĐ: ${escapeHtml(formatMoney(liquidationCost))}${liquidationCost ? ' đ' : ''} <i>(viết bằng chữ)</i></p><p class="line">- Giá trị thu hồi: ${escapeHtml(formatMoney(recoveryValue))}${recoveryValue ? ' đ' : ''} <i>(viết bằng chữ)</i></p></div>`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>${documentTitle}</title><style>
      @page { size: A4 portrait; margin: 13mm; }
      * { box-sizing: border-box; } body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; margin: 0; }
      .header { display:flex; justify-content:space-between; align-items:flex-start; } .brand-logo { display:block; width:118px; height:auto; object-fit:contain; } .form { font-size:10pt; font-weight:bold; font-style:italic; }
      h1 { font-size:16pt; text-align:center; margin: 12px 0 1px; } .subtitle { text-align:center; font-style:italic; margin: 0 0 1px; } .number { text-align:center; font-style:italic; margin-bottom:12px; }
      p { margin:3px 0; line-height:1.25; } .department { display:inline-block; min-width:45%; margin-left:14px; } .section { font-weight:bold; margin-top:6px; }
      table { border-collapse:collapse; width:100%; margin-top:3px; font-size:9.2pt; } thead { display:table-header-group; } tr { break-inside:avoid; page-break-inside:avoid; } th, td { border:0.7px solid #111; padding:4px 3px; vertical-align:top; } th { text-align:center; font-weight:bold; } .center { text-align:center; } .money { text-align:right; white-space:nowrap; }
      .post { margin-top:7px; } .line { border-bottom: 1px dotted #333; min-height:19px; } .date { margin-top:18px; text-align:right; font-style:italic; } .signatures { display:flex; justify-content:space-between; gap:16px; margin-top:12px; text-align:center; font-weight:bold; } .signatures > div { width:33%; min-height:78px; } .signatures em { display:block; margin-top:3px; font-weight:normal; font-size:10pt; }
      .footer { position:fixed; bottom:4mm; left:0; right:0; text-align:center; font-size:8pt; color:#555; } 
    </style></head><body>
      <div class="header"><img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="DANKO GROUP"><div class="form">Mẫu số: ${formNo}</div></div>
      <h1>${documentTitle}</h1>${documentSubTitle ? `<p class="subtitle">${documentSubTitle}</p>` : ''}<div class="number">Số: ${escapeHtml(documentNo || (isDestruction ? '...... / BBTH' : '...... / BBTLTS'))}</div>
      <p>Hôm nay, ngày ${escapeHtml(formatDate(documentDate))} tại ${escapeHtml(location || '........................................................')}.</p>
      <p>Chúng tôi gồm:</p><p>${attendeeLines}</p><p>Cùng tiến hành ${isDestruction ? 'tiêu hủy' : 'thanh lý'} tài sản với nội dung như sau:</p>
      <p class="section">I. Tài sản ${isDestruction ? 'tiêu hủy' : 'thanh lý'}:</p>
      <table><thead>${tableHeader}</thead><tbody>${rows}</tbody></table>
      ${postContent}
      <p class="date">Ngày ...... tháng ...... năm ........</p><div class="signatures"><div>BLĐ phê duyệt<em>(Ký, ghi rõ họ tên)</em></div><div>Trưởng Ban thanh lý<em>(Ký, ghi rõ họ tên)</em></div><div>Người lập biểu<em>(Ký, ghi rõ họ tên)</em></div></div>
      <div class="footer">${documentTitle} - ${formNo}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full max-w-7xl items-center py-6">
        <div className="w-full overflow-hidden rounded-3xl bg-slate-100 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <div><h2 className="text-xl font-black text-slate-900">{isDestruction ? 'Biên bản tiêu hủy tài sản' : 'Biên bản thanh lý tài sản'}</h2><p className="text-xs text-slate-500">Mẫu {isDestruction ? 'BM05/QLTS' : 'BM04/QLTS'} - {preparedAssets.length} mã tài sản{sourceDocumentNos.length > 1 ? `, gộp ${sourceDocumentNos.length} phiếu LQ` : ''}</p></div>
            <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid max-h-[72vh] overflow-y-auto lg:grid-cols-[330px_minmax(0,1fr)]">
            <section className="space-y-4 border-b border-slate-200 bg-white p-5 lg:border-b-0 lg:border-r">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">Thông tin trước khi in</p>
              <label className="block text-xs font-bold text-slate-600">Loại biên bản<select value={template} onChange={(event) => setTemplate(event.target.value as 'LIQUIDATION' | 'DESTRUCTION')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500"><option value="LIQUIDATION">Biên bản thanh lý — BM04/QLTS</option><option value="DESTRUCTION">Biên bản tiêu hủy — BM05/QLTS</option></select></label>
              <label className="block text-xs font-bold text-slate-600">Số biên bản<input value={documentNo} onChange={(event) => setDocumentNo(event.target.value)} placeholder=".../BBTLTS" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500" /></label>
              <label className="block text-xs font-bold text-slate-600">Ngày lập<input type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500" /></label>
              <label className="block text-xs font-bold text-slate-600">Địa điểm<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Nhập địa điểm lập biên bản" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500" /></label>
              {attendees.map((attendee, index) => <div key={index} className="grid grid-cols-2 gap-2"><input value={attendee.name} onChange={(event) => updateAttendee(index, 'name', event.target.value)} placeholder={`Ông/Bà ${index + 1}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-primary-500" /><input value={attendee.department} onChange={(event) => updateAttendee(index, 'department', event.target.value)} placeholder="Phòng ban/bộ phận" className="rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-primary-500" /></div>)}
              <div className="flex items-center gap-2"><button type="button" onClick={addAttendee} className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-100"><Plus className="h-3.5 w-3.5" /> Thêm người</button>{attendees.length > (isDestruction ? 4 : 3) && <button type="button" onClick={removeAttendee} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"><Minus className="h-3.5 w-3.5" /> Bớt người</button>}</div>
              {!isDestruction && <><label className="block text-xs font-bold text-slate-600">Hình thức thanh lý<input value={method} onChange={(event) => setMethod(event.target.value)} placeholder="Nhập hình thức thanh lý" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500" /></label><div className="grid grid-cols-2 gap-2"><label className="block text-xs font-bold text-slate-600">Chi phí thanh lý<input inputMode="numeric" value={liquidationCost} onChange={(event) => setLiquidationCost(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500" /></label><label className="block text-xs font-bold text-slate-600">Giá trị thu hồi<input inputMode="numeric" value={recoveryValue} onChange={(event) => setRecoveryValue(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500" /></label></div></>}
              {isDestruction && <label className="block text-xs font-bold text-slate-600">Kết luận về tài sản<textarea value={conclusion} onChange={(event) => setConclusion(event.target.value)} placeholder="Nhập nội dung kết luận..." rows={3} className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500" /></label>}
            </section>
            <section className="bg-slate-200 p-4 sm:p-7"><div className="mx-auto max-w-[794px] bg-white px-6 py-5 text-[11px] font-serif text-slate-950 shadow-sm sm:px-9">
              <div className="flex justify-between"><img src={dankoGroupLogo} alt="DANKO GROUP" className="h-auto w-[118px] object-contain" /><div className="pt-1 text-xs font-bold italic">Mẫu số: {isDestruction ? 'BM05/QLTS' : 'BM04/QLTS'}</div></div>
              <h3 className="mt-2 text-center text-lg font-bold">{isDestruction ? 'BIÊN BẢN TIÊU HỦY' : 'BIÊN BẢN THANH LÝ TÀI SẢN'}</h3>{isDestruction && <p className="text-center italic">Tài sản không còn giá trị sử dụng</p>}<p className="text-center italic">Số: {documentNo || (isDestruction ? '...... / BBTH' : '...... / BBTLTS')}</p>{sourceDocumentNos.length > 1 && <p className="text-center text-[9px] italic text-slate-500">Gộp phiếu LQ: {sourceDocumentNos.join(', ')}</p>}<p>Hôm nay, ngày {formatDate(documentDate)} tại {location || '................................'}.</p><p>Chúng tôi gồm:</p>{attendees.map((attendee, index) => <p key={index}>{index + 1}. Ông/Bà: {attendee.name || '........................'} <span className="ml-8">Phòng ban/bộ phận: {attendee.department || '........................'}</span></p>)}<p>Cùng tiến hành {isDestruction ? 'tiêu hủy' : 'thanh lý'} tài sản với nội dung như sau:</p><p className="font-bold">I. Tài sản {isDestruction ? 'tiêu hủy' : 'thanh lý'}:</p>
              <div className="overflow-x-auto"><table className="w-full border-collapse text-[9px]"><thead><tr className="bg-slate-50">{isDestruction ? <><th className="border border-black p-1">STT</th><th className="border border-black p-1">Mã tài sản</th><th className="border border-black p-1">Mô tả kỹ thuật</th><th className="border border-black p-1">Phòng/Ban</th><th className="border border-black p-1">Tình trạng</th><th className="border border-black p-1">Ghi chú</th></> : <><th className="border border-black p-1">STT</th><th className="border border-black p-1">Mã tài sản</th><th className="border border-black p-1">Mô tả kỹ thuật</th><th className="border border-black p-1">Năm sử dụng</th><th className="border border-black p-1">Nguyên giá</th><th className="border border-black p-1">Khấu hao còn lại</th><th className="border border-black p-1">Tình trạng</th><th className="border border-black p-1">Ghi chú</th></>}</tr></thead><tbody>{preparedAssets.map((asset, index) => <tr key={asset.id}><td className="border border-black p-1 text-center">{index + 1}</td><td className="border border-black p-1 text-center">{asset.assetCode}</td><td className="whitespace-pre-line border border-black p-1">{asset.description}</td>{isDestruction ? <><td className="border border-black p-1">{asset.departmentName || asset.department || ''}</td><td className="border border-black p-1">{asset.actualCondition}</td><td className="border border-black p-1">{asset.note}</td></> : <><td className="border border-black p-1 text-center">{asset.yearInUse}</td><td className="border border-black p-1 text-right">{formatMoney(asset.purchasePriceExVat)}</td><td className="border border-black p-1 text-right">{formatMoney(asset.remainingValue)}</td><td className="border border-black p-1">{asset.actualCondition}</td><td className="border border-black p-1">{asset.note}</td></>}</tr>)}</tbody></table></div>
              {isDestruction ? <><p className="mt-2 font-bold">II. Kết luận của tài sản:</p><p className="min-h-5 whitespace-pre-wrap border-b border-dotted border-slate-700">{conclusion}</p></> : <><p className="mt-2 font-bold">II. Hình thức thanh lý:</p><p className="min-h-5 border-b border-dotted border-slate-700">{method}</p><p className="font-bold">III. Kết quả thanh lý TSCĐ:</p><p className="border-b border-dotted border-slate-700">- Chi phí thanh lý TSCĐ: {formatMoney(liquidationCost)} {liquidationCost ? 'đ' : ''}</p><p className="border-b border-dotted border-slate-700">- Giá trị thu hồi: {formatMoney(recoveryValue)} {recoveryValue ? 'đ' : ''}</p></>}
              <p className="mt-5 text-right italic">Ngày ...... tháng ...... năm ........</p><div className="mt-3 grid grid-cols-3 gap-2 text-center font-bold"><div>BLĐ phê duyệt<br /><span className="font-normal italic">(Ký, ghi rõ họ tên)</span></div><div>Trưởng Ban thanh lý<br /><span className="font-normal italic">(Ký, ghi rõ họ tên)</span></div><div>Người lập biểu<br /><span className="font-normal italic">(Ký, ghi rõ họ tên)</span></div></div>
            </div></section>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4"><button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Đóng</button><button onClick={openPrintWindow} className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><FileDown className="mr-2 h-4 w-4" /> Xuất PDF</button><button onClick={openPrintWindow} className="btn-primary inline-flex items-center px-4 py-2.5 text-sm"><Printer className="mr-2 h-4 w-4" /> In biên bản</button></div>
        </div>
      </div>
    </div>
  );
};
