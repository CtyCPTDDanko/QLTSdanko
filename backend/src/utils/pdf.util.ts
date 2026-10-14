const pdfmake = require('pdfmake');
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import path from 'path';
import fs from 'fs';
import prisma from './prisma';

// NFC normalize all Vietnamese text to prevent broken diacritical marks in PDF
function nfc(text: any): string {
  if (text === null || text === undefined) return '';
  return String(text).normalize('NFC');
}

let fonts: any;
try {
  // Find the fonts directory dynamically (supports both dev and prod/dist mode)
  let fontsDir = path.join(__dirname, '../../fonts');
  if (!fs.existsSync(path.join(fontsDir, 'NotoSans-Regular.ttf'))) {
    fontsDir = path.join(__dirname, '../../../fonts');
  }

  const notoRegular = path.join(fontsDir, 'NotoSans-Regular.ttf');
  const notoMedium = path.join(fontsDir, 'NotoSans-Medium.ttf');
  const notoItalic = path.join(fontsDir, 'NotoSans-Italic.ttf');
  const notoMediumItalic = path.join(fontsDir, 'NotoSans-MediumItalic.ttf');

  const notoExists = fs.existsSync(notoRegular) && 
                     fs.existsSync(notoMedium) && 
                     fs.existsSync(notoItalic) && 
                     fs.existsSync(notoMediumItalic);

  if (notoExists) {
    console.log('[PDF] Using Noto Sans fonts (Vietnamese support) from:', fontsDir);
    fonts = {
      Roboto: {
        normal: notoRegular,
        bold: notoMedium,
        italics: notoItalic,
        bolditalics: notoMediumItalic
      }
    };
  } else {
    // Fallback to old Roboto fonts
    const regularPath = path.join(fontsDir, 'Roboto-Regular.ttf');
    const mediumPath = path.join(fontsDir, 'Roboto-Medium.ttf');
    const italicPath = path.join(fontsDir, 'Roboto-Italic.ttf');
    const boldItalicPath = path.join(fontsDir, 'Roboto-MediumItalic.ttf');

    const allExist = fs.existsSync(regularPath) && 
                     fs.existsSync(mediumPath) && 
                     fs.existsSync(italicPath) && 
                     fs.existsSync(boldItalicPath);

    if (allExist) {
      console.log('[PDF] Using Roboto fonts (fallback) from:', fontsDir);
      fonts = {
        Roboto: {
          normal: regularPath,
          bold: mediumPath,
          italics: italicPath,
          bolditalics: boldItalicPath
        }
      };
    } else {
      throw new Error(`No TrueType font files found in ${fontsDir}`);
    }
  }
} catch (error) {
  console.error('PDF_FONT_LOAD_ERROR: Falling back to standard Helvetica.', error);
  fonts = {
    Roboto: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique'
    }
  };
}

pdfmake.setFonts(fonts);

export class PdfUtil {
  static async generateHandoverPdf(
    document: any, 
    options: { configJson?: any, templateName?: string, templateCode?: string, itemKind?: 'ASSET' | 'TOOL' } = {}
  ): Promise<Buffer> {
    const isToolDocument = options.itemKind === 'TOOL';
    const itemIds = document.items.map((item: any) => isToolDocument ? item.toolId : item.assetId);
    const records: any[] = isToolDocument
      ? await prisma.toolEquipment.findMany({ where: { id: { in: itemIds } } })
      : await prisma.asset.findMany({ where: { id: { in: itemIds } } });
    const recordMap = new Map(records.map(record => [record.id, record]));
    const itemNoun = isToolDocument ? 'CCDC' : 'tài sản';

    const docDate = document.confirmedAt ? new Date(document.confirmedAt) : new Date(document.createdAt);
    const day = docDate.getDate().toString().padStart(2, '0');
    const month = (docDate.getMonth() + 1).toString().padStart(2, '0');
    const year = docDate.getFullYear();
    
    const location = nfc(document.newLocation) || '................................';
    const city = nfc(document.newCity) || 'Hà Nội';
    const isAreaRecipient = document.recipientType === 'AREA';

    let titleText = nfc(options.templateName) || `BIÊN BẢN BÀN GIAO ${isToolDocument ? 'CÔNG CỤ DỤNG CỤ' : 'TÀI SẢN'}`;
    if (isToolDocument && options.templateName) {
      titleText = titleText.replace(/TÀI SẢN/gi, 'CÔNG CỤ DỤNG CỤ');
    }
    let senderRoleLabel = 'Đại diện bên giao';
    let recipientRoleLabel = 'Đại diện bên nhận';

    if (!options.templateName) {
      if (document.type === 'TRANSFER') {
        titleText = `BIÊN BẢN ĐIỀU CHUYỂN ${isToolDocument ? 'CÔNG CỤ DỤNG CỤ' : 'TÀI SẢN'}`;
      } else if (document.type === 'LOCATION_TRANSFER') {
        titleText = `BIÊN BẢN ĐIỀU CHUYỂN VỊ TRÍ ${isToolDocument ? 'CÔNG CỤ DỤNG CỤ' : 'TÀI SẢN'}`;
      } else if (document.type === 'RECALL') {
        titleText = `BIÊN BẢN THU HỒI ${isToolDocument ? 'CÔNG CỤ DỤNG CỤ' : 'TÀI SẢN'}`;
        senderRoleLabel = 'Đại diện bên bàn giao';
        recipientRoleLabel = 'Đại diện đơn vị thu hồi';
      }
    } else {
      if (options.templateName.includes('ĐIỀU CHUYỂN')) {
        senderRoleLabel = 'Đại diện bên giao';
        recipientRoleLabel = 'Đại diện bên nhận';
      } else if (options.templateName.includes('THU HỒI')) {
        senderRoleLabel = 'Đại diện bên bàn giao';
        recipientRoleLabel = 'Đại diện đơn vị thu hồi';
      } else if (options.templateName.includes('KIỂM KÊ')) {
        senderRoleLabel = 'Trưởng Ban kiểm kê';
        recipientRoleLabel = 'Thành viên Ban kiểm kê';
      } else if (options.templateName.includes('THANH LÝ')) {
        senderRoleLabel = 'Đại diện bên giao';
        recipientRoleLabel = 'Đại diện Hội đồng thanh lý';
      } else if (options.templateName.includes('TIÊU HỦY') || options.templateName.includes('BÁO MẤT')) {
        senderRoleLabel = 'Đại diện bên giao';
        recipientRoleLabel = 'Đại diện bên nhận tiêu hủy';
      }
    }

    // Default configuration if no custom configJson is provided
    const config = options.configJson || {
      page: { size: 'A4', orientation: 'portrait', marginTop: 56, marginRight: 56, marginBottom: 70, marginLeft: 56 },
      header: { showLogo: true, departmentText: 'BỘ PHẬN QLTS', showTemplateCode: true, showDocumentQr: true },
      assetTable: { showAssetQr: true, assetQrSize: 50, repeatHeader: true, columns: ['index', 'assetCodeQr', 'assetName', 'specification', 'serial', 'unit', 'quantity', 'condition', 'note'] },
      signature: { columns: ['sender', 'receiver', 'qlts'] },
      footer: { showSupportLine: true, supportLine: 'CBNV có nhu cầu hỗ trợ về CNTT xin liên hệ: Lê Khánh Hùng – Phone/Viber: 0977131579', showPageNumber: true }
    };

    // Parse config settings
    const pageSettings = config.page || {};
    const headerSettings = config.header || {};
    const tableSettings = config.assetTable || {};
    const sigSettings = config.signature || {};
    const footerSettings = config.footer || {};

    const pageMargins = [
      pageSettings.marginLeft !== undefined ? Number(pageSettings.marginLeft) : 56,
      pageSettings.marginTop !== undefined ? Number(pageSettings.marginTop) : 56,
      pageSettings.marginRight !== undefined ? Number(pageSettings.marginRight) : 56,
      pageSettings.marginBottom !== undefined ? Number(pageSettings.marginBottom) : 70
    ];

    // Build Header columns
    const headerColumns: any[] = [];
    if (headerSettings.showLogo !== false) {
      headerColumns.push({
        stack: [
          { text: nfc(headerSettings.companyName) || 'DANKO GROUP', style: 'companyHeader' },
          { text: nfc(headerSettings.departmentText) || 'BỘ PHẬN QLTS', style: 'departmentHeader' }
        ],
        width: '*'
      });
    } else {
      headerColumns.push({ text: '', width: '*' });
    }

    if (headerSettings.showDocumentQr !== false) {
      headerColumns.push({
        stack: [
          { qr: document.documentNo, fit: 50, alignment: 'right' },
          { text: 'Mã số biên bản', fontSize: 6.5, color: '#64748b', alignment: 'right', margin: [0, 3, 0, 0] }
        ],
        width: 'auto',
        margin: [0, -10, 0, 0]
      });
    }

    if (headerSettings.showTemplateCode !== false) {
      headerColumns.push({
        text: nfc(`Mẫu số: ${options.templateCode || config.code || 'BM02/QLTS'}`),
        style: 'templateCodeHeader',
        alignment: 'right',
        width: 100
      });
    }

    const content: any[] = [
      {
        columns: headerColumns,
        columnGap: 10
      },
      { text: '\n\n' },
      { text: nfc(titleText), style: 'documentTitle', alignment: 'center' },
      { text: nfc(`Số: ${document.documentNo}`), style: 'documentSubNo', alignment: 'center' },
      { text: '\n\n' },
      { 
        text: [
          { text: 'Hôm nay', font: 'Roboto' },
          nfc(`, ngày ${day} tháng ${month} năm ${year}, tại ${location}`)
        ],
        style: 'normalText' 
      },
      { text: nfc('Chúng tôi gồm:'), style: 'normalText', margin: [0, 5, 0, 10] },
      { text: nfc(`1. ${senderRoleLabel}`), style: 'sectionHeader' },
      {
        columns: [
          { text: nfc(`Ông/Bà: ${nfc(document.senderName) || '................................'}`), style: 'normalText', width: '50%' },
          { text: nfc(`Bộ phận: ${nfc(document.senderDepartment) || '................................'}`), style: 'normalText', width: '50%' }
        ],
        margin: [0, 2, 0, 2]
      },
      { 
        text: nfc(`Chức vụ: ${nfc(document.senderPosition) || '................................'}`), 
        style: 'normalText',
        margin: [0, 2, 0, 10]
      },
      { text: nfc(`2. ${recipientRoleLabel}`), style: 'sectionHeader' },
      {
        columns: [
          { 
            text: nfc(isAreaRecipient
              ? `Khu vực nhận: ${nfc(document.recipientArea) || nfc(document.newLocation) || '................................'}`
              : `Ông/Bà: ${document.type === 'RECALL' ? (nfc(document.senderName) || '................................') : (nfc(document.recipientName) || '................................')}`),
            style: 'normalText', 
            width: '50%' 
          },
          { 
            text: nfc(`Bộ phận: ${document.type === 'RECALL' ? 'Bộ phận QLTS / HCNS / Kho' : (nfc(document.recipientDepartment) || '................................')}`), 
            style: 'normalText', 
            width: '50%' 
          }
        ],
        margin: [0, 2, 0, 2]
      },
      { 
        text: nfc(isAreaRecipient
          ? `Người phụ trách: ${nfc(document.recipientName) || 'Không chỉ định'}`
          : `Chức vụ: ${document.type === 'RECALL' ? 'Cán bộ Bộ phận QLTS' : (nfc(document.recipientPosition) || '................................')}`),
        style: 'normalText',
        margin: [0, 2, 0, 15]
      },
      { text: nfc(`Cùng giao/nhận ${itemNoun} như sau:`), style: 'normalTextBold', margin: [0, 0, 0, 8] }
    ];

    // Build Asset Table Columns dynamically
    const COLUMN_HEADERS: Record<string, any> = {
      index: { text: 'STT', style: 'tableHeader', alignment: 'center' },
      assetCode: { text: nfc(isToolDocument ? 'Mã CCDC' : 'Mã tài sản'), style: 'tableHeader', alignment: 'center' },
      assetCodeQr: { text: nfc(isToolDocument ? 'Mã CCDC / QR' : 'Mã tài sản / QR'), style: 'tableHeader', alignment: 'center' },
      assetName: { text: nfc(isToolDocument ? 'Tên CCDC' : 'Tên tài sản'), style: 'tableHeader' },
      specification: { text: nfc('Mô tả kỹ thuật'), style: 'tableHeader' },
      serial: { text: 'Serial', style: 'tableHeader' },
      unit: { text: nfc('ĐVT'), style: 'tableHeader', alignment: 'center' },
      quantity: { text: 'SL', style: 'tableHeader', alignment: 'center' },
      condition: { text: nfc('Tình trạng'), style: 'tableHeader' },
      note: { text: nfc('Ghi chú'), style: 'tableHeader' },
      purchasePriceExVat: { text: nfc('Đơn giá'), style: 'tableHeader', alignment: 'right' }
    };

    const COLUMN_WIDTHS: Record<string, string | number> = {
      index: 20,
      assetCode: 70,
      assetCodeQr: 85,
      assetName: '*',
      specification: '*',
      serial: 60,
      unit: 25,
      quantity: 20,
      condition: 50,
      note: 45,
      purchasePriceExVat: 55
    };

    const activeColumns: string[] = tableSettings.columns || ['index', 'assetCodeQr', 'assetName', 'specification', 'serial', 'unit', 'quantity', 'condition', 'note'];
    
    const widths = activeColumns.map(col => COLUMN_WIDTHS[col] || '*');
    const headerRow = activeColumns.map(col => COLUMN_HEADERS[col] || { text: col, style: 'tableHeader' });

    const showQrInTable = tableSettings.showAssetQr !== false;
    const qrSize = tableSettings.assetQrSize !== undefined ? Number(tableSettings.assetQrSize) : 48;

    const bodyRows = document.items.map((item: any, index: number) => {
      const record: any = recordMap.get(isToolDocument ? item.toolId : item.assetId);
      const spec = nfc(isToolDocument ? (record?.category || record?.initialCondition) : (record?.usagePurpose || record?.level4Name)) || '---';
      const serial = nfc(record?.serialNumber) || '---';
      const isUsing = ['ASSIGNED', 'USING'].includes(record?.status);
      const cond = isUsing ? nfc('Đang sử dụng') : (record?.status === 'IN_STOCK' ? nfc('Trong kho') : (record?.status === 'LOST' ? nfc('Mất') : nfc(record?.initialCondition) || nfc('Bình thường')));
      const rawPrice = isToolDocument ? record?.purchasePrice : record?.purchasePriceExVat;
      const price = rawPrice ? rawPrice.toLocaleString() : '---';

      const vMargin = showQrInTable && activeColumns.includes('assetCodeQr') ? [0, 15, 0, 5] : [0, 4, 0, 4];

      return activeColumns.map(col => {
        switch (col) {
          case 'index':
            return { text: (index + 1).toString(), style: 'tableCell', alignment: 'center', margin: vMargin };
          case 'assetCode':
            return { text: item.assetCode, style: 'tableCellCode', alignment: 'center', margin: vMargin };
          case 'assetCodeQr':
            return {
              stack: [
                { text: item.assetCode, style: 'tableCellCode', alignment: 'center' },
                ...(showQrInTable ? [{ qr: item.assetCode, fit: qrSize, alignment: 'center', margin: [0, 4, 0, 4] }] : [])
              ]
            };
          case 'assetName':
            return { text: nfc(item.assetName), style: 'tableCell', margin: vMargin };
          case 'specification':
            return { text: nfc(spec), style: 'tableCell', margin: vMargin };
          case 'serial':
            return { text: nfc(serial), style: 'tableCell', margin: vMargin };
          case 'unit':
            return { text: nfc(item.unit) || nfc('Cái'), style: 'tableCell', alignment: 'center', margin: vMargin };
          case 'quantity':
            return { text: String(isToolDocument ? (record?.quantity || 1) : 1), style: 'tableCell', alignment: 'center', margin: vMargin };
          case 'condition':
            return { text: nfc(cond), style: 'tableCell', margin: vMargin };
          case 'note':
            return { text: nfc(isToolDocument ? record?.note : record?.documentNote) || '---', style: 'tableCell', margin: vMargin };
          case 'purchasePriceExVat':
            return { text: price, style: 'tableCell', alignment: 'right', margin: vMargin };
          default:
            return { text: '', style: 'tableCell', margin: vMargin };
        }
      });
    });

    content.push({
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: widths,
        body: [
          headerRow,
          ...bodyRows
        ]
      },
      layout: {
        hLineWidth: function (i: number, node: any) {
          return (i === 0 || i === node.table.body.length) ? 1.5 : 0.8;
        },
        vLineWidth: function (i: number, node: any) {
          const wLen = node.table.widths ? node.table.widths.length : 9;
          return (i === 0 || i === wLen) ? 1.5 : 0.8;
        },
        hLineColor: function () { return '#475569'; },
        vLineColor: function () { return '#475569'; }
      }
    });

    content.push({ text: '\n' });

    // Commitments / Terms
    if (config.includeCommitment !== false) {
      let commitmentContent = [
        `Bên nhận đã kiểm tra đúng chủng loại, số lượng, tình trạng ${itemNoun} nêu trên và có trách nhiệm quản lý, sử dụng ${itemNoun} đúng mục đích công việc.`,
        `Hệ thống/cá nhân quản lý ${itemNoun} cập nhật trạng thái ${itemNoun} theo biên bản này sau khi các bên xác nhận.`
      ];
      if (config.commitmentText) {
        if (typeof config.commitmentText === 'string') {
          commitmentContent = config.commitmentText.split('\n').filter((l: string) => l.trim() !== '');
        } else if (Array.isArray(config.commitmentText)) {
          commitmentContent = config.commitmentText;
        }
      }

      content.push({
        stack: commitmentContent.map((text: string) => ({ text: nfc(text), style: 'commitmentText' })),
        margin: [0, 5, 0, 15]
      });
    }

    content.push(
      {
        text: nfc(`${city}, ngày ${day} tháng ${month} năm ${year}`),
        style: 'normalTextItalic',
        alignment: 'right',
        margin: [0, 0, 0, 15]
      }
    );

    // Build Signatures dinamically
    const SIGNATURE_ROLES: Record<string, { title: string; subtitle: string }> = {
      sender: { title: nfc(senderRoleLabel.toUpperCase()), subtitle: nfc('(Ký, ghi rõ họ tên)') },
      receiver: { title: nfc(recipientRoleLabel.toUpperCase()), subtitle: nfc('(Ký, ghi rõ họ tên)') },
      qlts: { title: nfc('CVTS / HCNS'), subtitle: nfc('(Ký, ghi rõ họ tên)') },
      director: { title: nfc('GIÁM ĐỐC'), subtitle: nfc('(Ký, đóng dấu)') },
      department: { title: nfc('TRƯỞNG PHÒNG'), subtitle: nfc('(Ký, ghi rõ họ tên)') },
      inventory: { title: nfc('HỘI ĐỒNG KIỂM KÊ'), subtitle: nfc('(Ký, ghi rõ họ tên)') }
    };

    const sigCols = sigSettings.columns || ['sender', 'receiver', 'qlts'];
    const numCols = sigCols.length;
    const colWidth = `${(100 / numCols).toFixed(2)}%`;

    const signatureColumns = sigCols.map((col: string) => {
      const role = SIGNATURE_ROLES[col] || { title: col.toUpperCase(), subtitle: '(Ký, ghi rõ họ tên)' };
      return {
        stack: [
          { text: nfc(role.title), style: 'signatureRole' },
          { text: nfc(role.subtitle), style: 'signatureSubText' }
        ],
        alignment: 'center',
        width: colWidth
      };
    });

    content.push({
      columns: signatureColumns,
      margin: [0, 0, 0, 45]
    });

    const docDefinition: TDocumentDefinitions = {
      pageSize: pageSettings.size || 'A4',
      pageOrientation: pageSettings.orientation || 'portrait',
      pageMargins: pageMargins as [number, number, number, number],
      content: content,
      footer: function (currentPage: number, pageCount: number) {
        const footerElements: any[] = [];
        
        if (footerSettings.showSupportLine !== false) {
          footerElements.push({ 
            text: nfc(footerSettings.supportLine || 'CBNV có nhu cầu hỗ trợ về CNTT xin liên hệ: Lê Khánh Hùng – Phone/Viber: 0977131579'), 
            fontSize: 7.5, 
            color: '#475569', 
            alignment: 'center',
            margin: [0, 0, 0, 8]
          });
        }

        const footerCols: any[] = [];
        if (footerSettings.showPageNumber !== false) {
          footerCols.push({ text: nfc(`Trang ${currentPage}/${pageCount}`), fontSize: 8, color: '#64748b' });
        } else {
          footerCols.push({ text: '', fontSize: 8 });
        }

        footerCols.push({ text: nfc(`Mã hồ sơ: ${document.documentNo}`), fontSize: 8, color: '#64748b', alignment: 'right' });

        footerElements.push({
          columns: footerCols
        });

        return {
          margin: [pageMargins[0], -15, pageMargins[2], 0],
          stack: footerElements
        };
      },
      styles: {
        companyHeader: { fontSize: 10, bold: true, color: '#0f172a' },
        departmentHeader: { fontSize: 8, bold: true, color: '#475569' },
        templateCodeHeader: { fontSize: 9, bold: true, italics: true, color: '#334155' },
        documentTitle: { fontSize: 14, bold: true, color: '#0f172a' },
        documentSubNo: { fontSize: 10, bold: true, italics: true, color: '#334155' },
        normalText: { fontSize: 9.5, color: '#0f172a' },
        normalTextBold: { fontSize: 9.5, bold: true, color: '#0f172a' },
        normalTextItalic: { fontSize: 9.5, italics: true, color: '#0f172a' },
        sectionHeader: { fontSize: 10, bold: true, color: '#0f172a', margin: [0, 0, 0, 4] },
        tableHeader: { fontSize: 8.5, bold: true, color: '#0f172a', margin: [0, 4, 0, 4] },
        tableCell: { fontSize: 8.5, color: '#0f172a', margin: [0, 3, 0, 3] },
        tableCellCode: { fontSize: 8, bold: true, color: '#0f172a', margin: [0, 3, 0, 3] },
        commitmentText: { fontSize: 8.5, italics: true, color: '#334155', margin: [0, 2, 0, 2] },
        signatureRole: { fontSize: 9.5, bold: true, color: '#0f172a' },
        signatureSubText: { fontSize: 8, italics: true, color: '#475569', margin: [0, 2, 0, 0] }
      },
      defaultStyle: {
        font: 'Roboto'
      }
    };

    const pdfDoc = pdfmake.createPdf(docDefinition);
    return await pdfDoc.getBuffer();
  }
}
