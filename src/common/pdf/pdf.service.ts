import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Quotation, Sale } from '../../sales/entities';
import { PaymentStatus } from '../../sales/entities/sale-payment.entity';
import { SalePaymentReceiptResponseDto } from '../../sales/dto';
import { join } from 'path';
import { existsSync } from 'fs';
import { CompanySettingService } from '../../settings/services/company-setting.service';
@Injectable()
export class PdfService {
  constructor(private readonly settingService: CompanySettingService) {}

  async generateInvoicePdf(sale: Sale): Promise<Buffer> {
    const settings = await this.settingService.getSettings();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 35, size: 'letter', bufferPages: true });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', (err) => {
        reject(err);
      });

      // --- Color Palette matching UI ---
      const COLOR_PRIMARY = '#0F172A';      // Slate 900
      const COLOR_TITLE = '#1E3A8A';        // Blue 900
      const COLOR_BLUE_BG = '#EFF6FF';      // Blue 50
      const COLOR_BLUE_BORDER = '#BFDBFE';  // Blue 200
      const COLOR_BLUE_TEXT = '#1E40AF';    // Blue 800
      const COLOR_CARD_BG = '#F8FAFC';      // Slate 50
      const COLOR_CARD_BORDER = '#E2E8F0';  // Slate 200
      const COLOR_TEXT_MUTED = '#64748B';   // Slate 500
      const COLOR_TEXT_DARK = '#334155';    // Slate 700
      const COLOR_BORDER = '#F1F5F9';       // Slate 100
      const COLOR_WHITE = '#FFFFFF';
      const COLOR_PURPLE_BG = '#FAF5FF';    // Purple 50
      const COLOR_PURPLE_BORDER = '#F3E8FF';// Purple 100
      const COLOR_PURPLE_TEXT = '#7C3AED';  // Purple 600

      let currentY = 20;

      // --- 1. Logo / Header Section ---
      let logoPath = '';
      const potentialLogoPaths = [
        join(process.cwd(), 'src/common/pdf/logo.png'),
        join(process.cwd(), 'dist/common/pdf/logo.png'),
        join(__dirname, 'logo.png'),
        join(process.cwd(), 'logo.png')
      ];

      for (const p of potentialLogoPaths) {
        if (existsSync(p)) {
          logoPath = p;
          break;
        }
      }

      const drawHeader = (startY: number) => {
        let y = startY;
        const logoWidth = 70;
        const companyX = 35 + logoWidth + 14;
        const companyBoxWidth = 230;

        const infoLines: string[] = [];
        if (settings.address) infoLines.push(settings.address);
        if (settings.phone) infoLines.push(`Tel: ${settings.phone}`);
        if (settings.nit) infoLines.push(`NIT: ${settings.nit}`);

        const fontSize = 8.5;
        const lineHeight = 15.5;

        // Altura ocupada por todo el bloque de texto
        const textBlockHeight =
          infoLines.length > 0
            ? fontSize + (infoLines.length - 1) * lineHeight
            : 0;

        let renderedLogoHeight = 50;

        if (logoPath) {
          try {
            const logoImage = (doc as any).openImage(logoPath);
            renderedLogoHeight = logoWidth * (logoImage.height / logoImage.width);

            const textStartY =
              y + (renderedLogoHeight - textBlockHeight) / 2;

            doc.image(logoImage, 35, y, {
              width: logoWidth,
            });

            doc
              .fillColor(COLOR_TEXT_MUTED)
              .font('Helvetica')
              .fontSize(fontSize);

            let lineY = textStartY;
            infoLines.forEach((line) => {
              doc.text(line, companyX, lineY, {
                width: companyBoxWidth,
                lineBreak: false,
                ellipsis: true,
              });
              lineY += lineHeight;
            });
          } catch (e) {
            doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(14).text(settings.companyName || 'CABEN', 35, y);
            doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);
            let lineY = y + 18;
            infoLines.forEach(line => {
              doc.text(line, 35, lineY, { width: 280 });
              lineY += lineHeight;
            });
          }
        } else {
          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(14).text(settings.companyName || 'CABEN', 35, y);
          doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);
          let lineY = y + 18;
          infoLines.forEach(line => {
            doc.text(line, 35, lineY, { width: 280 });
            lineY += lineHeight;
          });
        }

        // Right Side Header (Title & Badge) - Centrado vertical respecto al logo
        const titleFontSize = 16;
        const badgeHeight = 18;
        const rightGap = 5; // Separación entre título y badge
        const rightBlockHeight = titleFontSize + rightGap + badgeHeight;
        const rightStartY = y + (renderedLogoHeight - rightBlockHeight) / 2;

        doc.fillColor(COLOR_TITLE).font('Helvetica-Bold').fontSize(titleFontSize).text('NOTA DE CARGO', 360, rightStartY, { align: 'right', width: 217 });
        
        const badgeY = rightStartY + titleFontSize + rightGap;
        const badgeWidth = 100;
        const badgeX = 577 - badgeWidth;
        const badgeFontSize = 8.5;
        const badgeTextY = badgeY + (badgeHeight - badgeFontSize) / 2 + 1.2; // Bajado para compensar baseline y centrar visualmente
        doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fillAndStroke(COLOR_BLUE_BG, COLOR_BLUE_BORDER);
        doc.fillColor(COLOR_BLUE_TEXT).font('Helvetica-Bold').fontSize(badgeFontSize).text(`Nº: ${sale.invoiceNumber}`, badgeX, badgeTextY, { align: 'center', width: badgeWidth });

        y = y + Math.max(renderedLogoHeight, 48) + 12;

        // --- Divider Line ---
        doc.moveTo(35, y).lineTo(577, y).strokeColor(COLOR_CARD_BORDER).lineWidth(1).stroke();
        y += 18;

        return y;
      };

      currentY = drawHeader(currentY);

      // --- 2. Information Section (2 Columns Card) ---
      const infoBoxY = currentY;

      const customerName = (sale.customer?.name || sale.guestCustomer?.name || 'Consumidor Final').trim();
      const customerNit = (sale.customer?.nit || sale.guestCustomer?.nit || 'C/F').trim();
      const customerPhone = (sale.customer?.phone || sale.guestCustomer?.phone || '').trim();
      const customerAddress = (sale.customer?.address || sale.guestCustomer?.address || '').trim();

      const dateObj = new Date(sale.date);
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      const dateString = `${day}/${month}/${year} ${hours}:${minutes}`;

      const statusMap: Record<string, string> = {
        pending: 'Pendiente',
        confirmed: 'Confirmado',
        preparing: 'En preparación',
        ready_for_pickup: 'Listo para recoger',
        out_for_delivery: 'En camino',
        delivered: 'Entregado',
        partially_delivered: 'Entrega parcial',
        cancelled: 'Cancelado',
        on_hold: 'En espera',
      };
      const statusLabel = statusMap[sale.status] || sale.status;

      // Calcular altura requerida de la columna de cliente (soporte multilínea para dirección/nombre)
      doc.font('Helvetica').fontSize(8.5);
      const colWidth = 235;
      let leftColHeight = 24 + 13 + 13; // header + Nombre + NIT
      if (customerPhone) leftColHeight += 13;
      if (customerAddress) {
        leftColHeight += Math.max(13, doc.heightOfString(`Dirección: ${customerAddress}`, { width: colWidth }));
      }

      let rightColHeight = 24 + 13 + 13; // header + Fecha + Estado
      if (sale.branch) {
        rightColHeight += Math.max(13, doc.heightOfString(`Sucursal: ${sale.branch.name}`, { width: colWidth }));
      }
      if (sale.promisedDeliveryDate) {
        rightColHeight += 13;
      }

      const dynamicBoxHeight = Math.max(85, Math.max(leftColHeight, rightColHeight) + 12);
      doc.roundedRect(35, infoBoxY, 542, dynamicBoxHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);

      // Columna 1: Información del cliente
      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('INFORMACIÓN DEL CLIENTE', 48, infoBoxY + 10);
      
      let clientY = infoBoxY + 24;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_TEXT_DARK).text('Nombre: ', 48, clientY, { continued: true });
      doc.font('Helvetica').text(customerName);
      clientY += 13;

      doc.font('Helvetica-Bold').text('NIT: ', 48, clientY, { continued: true });
      doc.font('Helvetica').text(customerNit);
      clientY += 13;

      if (customerPhone) {
        doc.font('Helvetica-Bold').text('Teléfono: ', 48, clientY, { continued: true });
        doc.font('Helvetica').text(customerPhone);
        clientY += 13;
      }

      if (customerAddress) {
        doc.font('Helvetica-Bold');
        const addressLabelWidth = doc.widthOfString('Dirección: ');
        doc.text('Dirección: ', 48, clientY);
        doc.font('Helvetica').text(customerAddress, 48 + addressLabelWidth + 3.5, clientY, {
          width: colWidth - addressLabelWidth - 3.5,
          lineBreak: true,
        });
        clientY = Math.max(clientY + 13, doc.y + 2);
      }

      // Columna 2: Detalles de la emisión
      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('DETALLES DE LA EMISIÓN', 315, infoBoxY + 10);
      
      let emissionY = infoBoxY + 24;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_TEXT_DARK).text('Fecha de Emisión: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(dateString);
      emissionY += 13;

      if (sale.branch) {
        doc.font('Helvetica-Bold');
        const branchLabelWidth = doc.widthOfString('Sucursal: ');
        doc.text('Sucursal: ', 315, emissionY);
        doc.font('Helvetica').text(sale.branch.name, 315 + branchLabelWidth + 3.5, emissionY, {
          width: colWidth - branchLabelWidth - 3.5,
          lineBreak: true,
        });
        emissionY = Math.max(emissionY + 13, doc.y + 2);
      }

      if (sale.promisedDeliveryDate) {
        const pDate = new Date(sale.promisedDeliveryDate);
        const promisedText = `${String(pDate.getDate()).padStart(2, '0')}/${String(pDate.getMonth() + 1).padStart(2, '0')}/${pDate.getFullYear()}`;
        doc.font('Helvetica-Bold').text('Fecha de Entrega: ', 315, emissionY, { continued: true });
        doc.font('Helvetica').text(promisedText);
        emissionY += 13;
      }

      doc.font('Helvetica-Bold').text('Estado: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(statusLabel);
      emissionY += 13;

      currentY = infoBoxY + dynamicBoxHeight + 15;

      // --- 3. Items Table ---
      const drawTableHeader = (y: number) => {
        doc.roundedRect(35, y, 542, 22, 3).fill(COLOR_PRIMARY);
        doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(8);
        doc.text('CÓDIGO', 45, y + 6.5, { width: 75 });
        doc.text('NOMBRE', 125, y + 6.5, { width: 200 });
        doc.text('PRECIO Q.', 330, y + 6.5, { width: 75, align: 'right' });
        doc.text('CANTIDAD', 415, y + 6.5, { width: 70, align: 'right' });
        doc.text('TOTAL Q.', 495, y + 6.5, { width: 72, align: 'right' });
      };

      drawTableHeader(currentY);
      currentY += 22;

      // Agrupar items exactamente como en la plantilla Angular
      const groups: {
        productId: string;
        productName: string;
        sku: string;
        unitAbbr: string;
        unitPrice: number;
        items: any[];
        totalQuantity: number;
        totalAmount: number;
      }[] = [];

      (sale.details || []).forEach((detail) => {
        const prodId = detail.product?.id || '';
        let group = groups.find((g) => g.productId === prodId);
        if (!group) {
          group = {
            productId: prodId,
            productName: detail.product?.name || 'Producto',
            sku: detail.product?.sku || 'S/C',
            unitAbbr: detail.product?.unit?.abbreviation || '',
            unitPrice: Number(detail.unitPrice || 0),
            items: [],
            totalQuantity: 0,
            totalAmount: 0,
          };
          groups.push(group);
        }
        group.items.push(detail);
        group.totalQuantity += Number(detail.quantity || 0);
        group.totalAmount += Number(detail.lineTotal || 0);
      });

      groups.sort((a, b) => a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' }));

      groups.forEach((group) => {
        group.items.forEach((item) => {
          if (currentY > 670) {
            doc.addPage();
            currentY = drawHeader(20);
            drawTableHeader(currentY);
            currentY += 22;
          }

          doc.fillColor(COLOR_TEXT_DARK).font('Helvetica').fontSize(8.5);
          doc.text(group.sku, 45, currentY + 7.5, { width: 75, ellipsis: true });
          
          let discountText = '';
          if (Number(item.discountAmount) > 0) {
            discountText = ` (Desc: -Q${Number(item.discountAmount).toFixed(2)})`;
          }
          doc.text(`${group.productName}${discountText}`, 125, currentY + 7.5, { width: 200, ellipsis: true });
          
          doc.text(`Q${Number(item.unitPrice).toFixed(2)}`, 330, currentY + 7.5, { width: 75, align: 'right' });
          const qtyText = group.unitAbbr
            ? `${Number(item.quantity).toFixed(2)} ${group.unitAbbr}`
            : Number(item.quantity).toFixed(2);
          doc.text(qtyText, 415, currentY + 7.5, { width: 70, align: 'right' });
          doc.text(`Q${Number(item.lineTotal).toFixed(2)}`, 495, currentY + 7.5, { width: 72, align: 'right' });

          doc.moveTo(35, currentY + 24).lineTo(577, currentY + 24).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
          currentY += 24;
        });

        // Subtotal de grupo si tiene más de 1 pesaje
        if (group.items.length > 1) {
          if (currentY > 670) {
            doc.addPage();
            currentY = drawHeader(20);
            drawTableHeader(currentY);
            currentY += 22;
          }

          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(8.5);
          const totalQtyText = group.unitAbbr
            ? `${group.totalQuantity.toFixed(2)} ${group.unitAbbr}`
            : group.totalQuantity.toFixed(2);
          doc.text(totalQtyText, 415, currentY + 5.5, { width: 70, align: 'right' });
          doc.text(`Q${group.totalAmount.toFixed(2)}`, 495, currentY + 5.5, { width: 72, align: 'right' });

          doc.moveTo(415, currentY + 20).lineTo(572, currentY + 20).strokeColor('#CBD5E1').lineWidth(0.5).dash(2, { space: 2 }).stroke().undash();
          currentY += 22;
        }
      });

      // --- 4. Totals Area ---
      if (currentY > 560) {
        doc.addPage();
        currentY = drawHeader(20);
      }

      currentY += 15;
      const startBottomY = currentY;

      // Derecha: Totales
      const hasDiscount = Number(sale.discountAmount || 0) > 0;
      const hasTax = Number(sale.taxAmount || 0) > 0;
      let extraLinesCount = 0;
      if (hasDiscount) extraLinesCount++;
      if (hasTax) extraLinesCount++;

      const totalsBoxWidth = 207;
      const totalsBoxX = 577 - totalsBoxWidth; // 370
      const totalsBoxHeight = 82 + extraLinesCount * 18;
      doc.roundedRect(totalsBoxX, startBottomY, totalsBoxWidth, totalsBoxHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);

      let tY = startBottomY + 12;
      const labelX = totalsBoxX + 10;
      const valueX = totalsBoxX + 90;
      const valueWidth = totalsBoxWidth - 90 - 10;

      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(8.5).text('Subtotal:', labelX, tY);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica').fontSize(8.5).text(`Q${Number(sale.subtotal).toFixed(2)}`, valueX, tY, { width: valueWidth, align: 'right' });
      tY += 18;

      if (hasDiscount) {
        doc.fillColor(COLOR_TEXT_MUTED).text('Descuento:', labelX, tY);
        doc.fillColor('#DC2626').text(`-Q${Number(sale.discountAmount).toFixed(2)}`, valueX, tY, { width: valueWidth, align: 'right' });
        tY += 18;
      }

      if (hasTax) {
        doc.fillColor(COLOR_TEXT_MUTED).text('Impuestos:', labelX, tY);
        doc.fillColor(COLOR_TEXT_DARK).text(`Q${Number(sale.taxAmount).toFixed(2)}`, valueX, tY, { width: valueWidth, align: 'right' });
        tY += 18;
      }

      doc.moveTo(totalsBoxX + 10, tY).lineTo(totalsBoxX + totalsBoxWidth - 10, tY).strokeColor(COLOR_CARD_BORDER).lineWidth(1).stroke();
      tY += 10;

      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(10.5).text('TOTAL:', labelX, tY);
      doc.text(`Q${Number(sale.total).toFixed(2)}`, valueX, tY, { width: valueWidth, align: 'right' });

      // --- 5. Render Fixed Footer on all pages ---
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        // Separador gris fijo encima del footer
        doc.moveTo(35, 700).lineTo(577, 700).strokeColor(COLOR_CARD_BORDER).lineWidth(1).stroke();

        doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(8.5).text('¡Gracias por su preferencia!', 35, 712, { align: 'center', width: 542 });
        doc.fontSize(8).text('Control Interno - No válido como Factura Tributaria', 35, 724, { align: 'center', width: 542 });
        doc.fontSize(7.5).text('Documento para validación y conciliación de cargos', 35, 742, { align: 'center', width: 542 });
      }

      doc.end();
    });
  }

  async generatePaymentReceiptPdf(receipt: SalePaymentReceiptResponseDto): Promise<Buffer> {
    const settings = await this.settingService.getSettings();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 35, size: 'letter', bufferPages: true });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', (err) => {
        reject(err);
      });

      const COLOR_PRIMARY = '#0F172A';
      const COLOR_TITLE = '#1E3A8A';
      const COLOR_BLUE_BG = '#EFF6FF';
      const COLOR_BLUE_BORDER = '#BFDBFE';
      const COLOR_BLUE_TEXT = '#1E40AF';
      const COLOR_CARD_BG = '#F8FAFC';
      const COLOR_CARD_BORDER = '#E2E8F0';
      const COLOR_TEXT_MUTED = '#64748B';
      const COLOR_TEXT_DARK = '#334155';
      const COLOR_BORDER = '#F1F5F9';
      const COLOR_WHITE = '#FFFFFF';
      const COLOR_PURPLE_BG = '#FAF5FF';
      const COLOR_PURPLE_BORDER = '#F3E8FF';
      const COLOR_GREEN = '#16A34A';
      const COLOR_RED = '#DC2626';
      const COLOR_ORANGE = '#EA580C';

      const money = (value: number) => `Q${Number(value || 0).toFixed(2)}`;

      let currentY = 20;

      let logoPath = '';
      const potentialLogoPaths = [
        join(process.cwd(), 'src/common/pdf/logo.png'),
        join(process.cwd(), 'dist/common/pdf/logo.png'),
        join(__dirname, 'logo.png'),
        join(process.cwd(), 'logo.png'),
      ];

      for (const p of potentialLogoPaths) {
        if (existsSync(p)) {
          logoPath = p;
          break;
        }
      }

      const drawHeader = (startY: number) => {
        let y = startY;
        const logoWidth = 70;
        const companyX = 35 + logoWidth + 14;
        const companyBoxWidth = 230;

        const infoLines: string[] = [];
        if (settings.address) infoLines.push(settings.address);
        if (settings.phone) infoLines.push(`Tel: ${settings.phone}`);
        if (settings.nit) infoLines.push(`NIT: ${settings.nit}`);

        const fontSize = 8.5;
        const lineHeight = 15.5;
        const textBlockHeight = infoLines.length > 0 ? fontSize + (infoLines.length - 1) * lineHeight : 0;
        let renderedLogoHeight = 50;

        if (logoPath) {
          try {
            const logoImage = (doc as any).openImage(logoPath);
            renderedLogoHeight = logoWidth * (logoImage.height / logoImage.width);

            const textStartY = y + (renderedLogoHeight - textBlockHeight) / 2;

            doc.image(logoImage, 35, y, { width: logoWidth });
            doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);

            let lineY = textStartY;
            infoLines.forEach((line) => {
              doc.text(line, companyX, lineY, { width: companyBoxWidth, lineBreak: false, ellipsis: true });
              lineY += lineHeight;
            });
          } catch (e) {
            doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(14).text(settings.companyName || 'CABEN', 35, y);
            doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);
            let lineY = y + 18;
            infoLines.forEach((line) => {
              doc.text(line, 35, lineY, { width: 280 });
              lineY += lineHeight;
            });
          }
        } else {
          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(14).text(settings.companyName || 'CABEN', 35, y);
          doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);
          let lineY = y + 18;
          infoLines.forEach((line) => {
            doc.text(line, 35, lineY, { width: 280 });
            lineY += lineHeight;
          });
        }

        const titleFontSize = 16;
        const badgeHeight = 18;
        const rightGap = 5;
        const rightBlockHeight = titleFontSize + rightGap + badgeHeight;
        const rightStartY = y + (renderedLogoHeight - rightBlockHeight) / 2;

        doc.fillColor(COLOR_TITLE).font('Helvetica-Bold').fontSize(titleFontSize).text('RECIBO DE ABONOS', 360, rightStartY, { align: 'right', width: 217 });

        const badgeY = rightStartY + titleFontSize + rightGap;
        const badgeWidth = 100;
        const badgeX = 577 - badgeWidth;
        const badgeFontSize = 8.5;
        const badgeTextY = badgeY + (badgeHeight - badgeFontSize) / 2 + 1.2;
        doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fillAndStroke(COLOR_BLUE_BG, COLOR_BLUE_BORDER);
        doc.fillColor(COLOR_BLUE_TEXT).font('Helvetica-Bold').fontSize(badgeFontSize).text(`Nº: ${receipt.invoiceNumber}`, badgeX, badgeTextY, { align: 'center', width: badgeWidth });

        y = y + Math.max(renderedLogoHeight, 48) + 12;
        doc.moveTo(35, y).lineTo(577, y).strokeColor(COLOR_CARD_BORDER).lineWidth(1).stroke();
        y += 18;

        return y;
      };

      currentY = drawHeader(currentY);

      const infoBoxY = currentY;
      const customerName = (receipt.customer?.name || 'Consumidor Final').trim();
      const rawNit = (receipt.customer?.nit || 'C/F').trim();
      const customerNit = rawNit.toUpperCase() === 'CF' ? 'C/F' : rawNit;
      const customerPhone = (receipt.customer?.phone || '').trim();
      const customerAddress = (receipt.customer?.address || '').trim();

      const dateObj = new Date(receipt.saleDate);
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      const dateString = `${day}/${month}/${year} ${hours}:${minutes}`;

      const statusMap: Record<string, string> = {
        pending: 'Pendiente',
        confirmed: 'Confirmado',
        preparing: 'En preparación',
        ready_for_pickup: 'Listo para recoger',
        out_for_delivery: 'En camino',
        delivered: 'Entregado',
        partially_delivered: 'Entrega parcial',
        cancelled: 'Cancelado',
        on_hold: 'En espera',
      };
      const statusLabel = statusMap[receipt.saleStatus] || receipt.saleStatus;

      doc.font('Helvetica').fontSize(8.5);
      const colWidth = 235;
      let leftColHeight = 24 + 13 + 13;
      if (customerPhone) leftColHeight += 13;
      if (customerAddress) {
        leftColHeight += Math.max(13, doc.heightOfString(`Dirección: ${customerAddress}`, { width: colWidth }));
      }

      let rightColHeight = 24 + 13 + 13;
      if (receipt.branch) {
        rightColHeight += Math.max(13, doc.heightOfString(`Sucursal: ${receipt.branch.name}`, { width: colWidth }));
      }
      if (receipt.promisedDeliveryDate) {
        rightColHeight += 13;
      }

      const dynamicBoxHeight = Math.max(85, Math.max(leftColHeight, rightColHeight) + 12);
      doc.roundedRect(35, infoBoxY, 542, dynamicBoxHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);

      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('INFORMACIÓN DEL CLIENTE', 48, infoBoxY + 10);

      let clientY = infoBoxY + 24;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_TEXT_DARK).text('Nombre: ', 48, clientY, { continued: true });
      doc.font('Helvetica').text(customerName);
      clientY += 13;

      doc.font('Helvetica-Bold').text('NIT: ', 48, clientY, { continued: true });
      doc.font('Helvetica').text(customerNit);
      clientY += 13;

      if (customerPhone) {
        doc.font('Helvetica-Bold').text('Teléfono: ', 48, clientY, { continued: true });
        doc.font('Helvetica').text(customerPhone);
        clientY += 13;
      }

      if (customerAddress) {
        doc.font('Helvetica-Bold');
        const addressLabelWidth = doc.widthOfString('Dirección: ');
        doc.text('Dirección: ', 48, clientY);
        doc.font('Helvetica').text(customerAddress, 48 + addressLabelWidth + 3.5, clientY, {
          width: colWidth - addressLabelWidth - 3.5,
          lineBreak: true,
        });
      }

      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('DETALLES DE LA EMISIÓN', 315, infoBoxY + 10);

      let emissionY = infoBoxY + 24;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_TEXT_DARK).text('Fecha de Emisión: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(dateString);
      emissionY += 13;

      if (receipt.branch) {
        doc.font('Helvetica-Bold');
        const branchLabelWidth = doc.widthOfString('Sucursal: ');
        doc.text('Sucursal: ', 315, emissionY);
        doc.font('Helvetica').text(receipt.branch.name, 315 + branchLabelWidth + 3.5, emissionY, {
          width: colWidth - branchLabelWidth - 3.5,
          lineBreak: true,
        });
        emissionY = Math.max(emissionY + 13, doc.y + 2);
      }

      if (receipt.promisedDeliveryDate) {
        const pDate = new Date(receipt.promisedDeliveryDate);
        const promisedText = `${String(pDate.getDate()).padStart(2, '0')}/${String(pDate.getMonth() + 1).padStart(2, '0')}/${pDate.getFullYear()}`;
        doc.font('Helvetica-Bold').text('Fecha de Entrega: ', 315, emissionY, { continued: true });
        doc.font('Helvetica').text(promisedText);
        emissionY += 13;
      }

      doc.font('Helvetica-Bold').text('Estado: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(statusLabel);

      currentY = infoBoxY + dynamicBoxHeight + 15;

      const drawTableHeader = (y: number) => {
        doc.roundedRect(35, y, 542, 22, 3).fill(COLOR_PRIMARY);
        doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(8);
        doc.text('FECHA', 45, y + 6.5, { width: 80 });
        doc.text('FORMA DE PAGO', 130, y + 6.5, { width: 130 });
        doc.text('SALDO ANTERIOR', 265, y + 6.5, { width: 95, align: 'right' });
        doc.text('ABONO', 365, y + 6.5, { width: 85, align: 'right' });
        doc.text('SALDO RESTANTE', 455, y + 6.5, { width: 107, align: 'right' });
      };

      drawTableHeader(currentY);
      currentY += 22;

      const payments = (receipt.payments || []).filter((p) => p.status !== PaymentStatus.CANCELLED);

      if (payments.length === 0) {
        doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(8.5);
        doc.text('No hay abonos registrados', 45, currentY + 7.5, { width: 522, align: 'center' });
        doc.moveTo(35, currentY + 24).lineTo(577, currentY + 24).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
        currentY += 24;
      }

      payments.forEach((payment) => {
        if (currentY > 670) {
          doc.addPage();
          currentY = drawHeader(20);
          drawTableHeader(currentY);
          currentY += 22;
        }

        const payDate = new Date(payment.date);
        const payDateText = `${String(payDate.getDate()).padStart(2, '0')}/${String(payDate.getMonth() + 1).padStart(2, '0')}/${payDate.getFullYear()}`;

        doc.fillColor(COLOR_TEXT_DARK).font('Helvetica').fontSize(8.5);
        doc.text(payDateText, 45, currentY + 7.5, { width: 80 });
        doc.text(payment.paymentMethod?.name || 'Pago', 130, currentY + 7.5, { width: 130, ellipsis: true });
        doc.text(money(payment.previousBalance), 265, currentY + 7.5, { width: 95, align: 'right' });
        doc.fillColor(COLOR_GREEN).text(money(payment.amount), 365, currentY + 7.5, { width: 85, align: 'right' });
        doc.fillColor(COLOR_TEXT_DARK).text(money(payment.remainingBalance), 455, currentY + 7.5, { width: 107, align: 'right' });

        doc.moveTo(35, currentY + 24).lineTo(577, currentY + 24).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
        currentY += 24;
      });

      if (currentY > 560) {
        doc.addPage();
        currentY = drawHeader(20);
      }

      currentY += 15;
      const startBottomY = currentY;
      const isFullyPaid = !!receipt.financialSummary?.isFullyPaid;
      const payBoxWidth = 260;
      const payBoxHeight = 82;

      doc.roundedRect(35, startBottomY, payBoxWidth, payBoxHeight, 6).fillAndStroke(COLOR_PURPLE_BG, COLOR_PURPLE_BORDER);

      if (isFullyPaid) {
        doc.fillColor(COLOR_GREEN).font('Helvetica-Bold').fontSize(9).text('Orden Liquidada', 47, startBottomY + 12);
        doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(8).text(
          'Esta orden no mantiene saldo pendiente. Los abonos cubren el total de la venta.',
          47,
          startBottomY + 28,
          { width: 236, lineGap: 2 },
        );
      } else {
        doc.fillColor(COLOR_ORANGE).font('Helvetica-Bold').fontSize(9).text('Saldo Pendiente de Pago', 47, startBottomY + 12);
        doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(8).text(
          'Esta orden mantiene un saldo pendiente conforme al historial de abonos.',
          47,
          startBottomY + 28,
          { width: 236, lineGap: 2 },
        );
      }

      const totalsBoxWidth = 207;
      const totalsBoxX = 577 - totalsBoxWidth;
      const totalsBoxHeight = 82;
      doc.roundedRect(totalsBoxX, startBottomY, totalsBoxWidth, totalsBoxHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);

      let tY = startBottomY + 12;
      const labelX = totalsBoxX + 10;
      const valueX = totalsBoxX + 90;
      const valueWidth = totalsBoxWidth - 90 - 10;
      const totalSale = Number(receipt.financialSummary?.totalSale || 0);
      const totalPaid = Number(receipt.financialSummary?.totalPaid || 0);
      const currentPending = Number(receipt.financialSummary?.currentPending || 0);

      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(8.5).text('Total de la Venta:', labelX, tY);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica').fontSize(8.5).text(money(totalSale), valueX, tY, { width: valueWidth, align: 'right' });
      tY += 18;

      doc.fillColor(COLOR_TEXT_MUTED).text('Total Abonado:', labelX, tY);
      doc.fillColor(COLOR_GREEN).text(`-${money(totalPaid)}`, valueX, tY, { width: valueWidth, align: 'right' });
      tY += 18;

      doc.moveTo(totalsBoxX + 10, tY).lineTo(totalsBoxX + totalsBoxWidth - 10, tY).strokeColor(COLOR_CARD_BORDER).lineWidth(1).stroke();
      tY += 10;

      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(10.5).text('Saldo Pendiente:', labelX, tY);
      doc.fillColor(isFullyPaid ? COLOR_GREEN : COLOR_RED).text(money(currentPending), valueX, tY, { width: valueWidth, align: 'right' });

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        doc.moveTo(35, 700).lineTo(577, 700).strokeColor(COLOR_CARD_BORDER).lineWidth(1).stroke();
        doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(8.5).text('¡Gracias por su preferencia!', 35, 712, { align: 'center', width: 542 });
        doc.fontSize(8).text('Historial y Estado de Cuenta Consolidado de Abonos', 35, 724, { align: 'center', width: 542 });
        doc.fontSize(7.5).text('Documento para validación y conciliación de abonos', 35, 742, { align: 'center', width: 542 });
      }

      doc.end();
    });
  }

  async generateQuotationPdf(quotation: Quotation): Promise<Buffer> {
    const settings = await this.settingService.getSettings();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 35, size: 'letter', bufferPages: true });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', (err) => {
        reject(err);
      });

      // --- Color Palette matching UI ---
      const COLOR_PRIMARY = '#0F172A';      // Slate 900
      const COLOR_TITLE = '#1E3A8A';        // Blue 900
      const COLOR_BLUE_BG = '#EFF6FF';      // Blue 50
      const COLOR_BLUE_BORDER = '#BFDBFE';  // Blue 200
      const COLOR_BLUE_TEXT = '#1E40AF';    // Blue 800
      const COLOR_CARD_BG = '#F8FAFC';      // Slate 50
      const COLOR_CARD_BORDER = '#E2E8F0';  // Slate 200
      const COLOR_TEXT_MUTED = '#64748B';   // Slate 500
      const COLOR_TEXT_DARK = '#334155';    // Slate 700
      const COLOR_BORDER = '#F1F5F9';       // Slate 100
      const COLOR_WHITE = '#FFFFFF';
      const COLOR_PURPLE_BG = '#FAF5FF';    // Purple 50
      const COLOR_PURPLE_BORDER = '#F3E8FF';// Purple 100
      const COLOR_PURPLE_TEXT = '#7C3AED';  // Purple 600

      let currentY = 20;

      // --- 1. Logo / Header Section ---
      let logoPath = '';
      const potentialLogoPaths = [
        join(process.cwd(), 'src/common/pdf/logo.png'),
        join(process.cwd(), 'dist/common/pdf/logo.png'),
        join(__dirname, 'logo.png'),
        join(process.cwd(), 'logo.png')
      ];

      for (const p of potentialLogoPaths) {
        if (existsSync(p)) {
          logoPath = p;
          break;
        }
      }

      const drawHeader = (startY: number) => {
        let y = startY;
        const logoWidth = 70;
        const companyX = 35 + logoWidth + 14;
        const companyBoxWidth = 230;

        const infoLines: string[] = [];
        if (settings.address) infoLines.push(settings.address);
        if (settings.phone) infoLines.push(`Tel: ${settings.phone}`);
        if (settings.nit) infoLines.push(`NIT: ${settings.nit}`);

        const fontSize = 8.5;
        const lineHeight = 15.5;

        // Altura ocupada por todo el bloque de texto
        const textBlockHeight =
          infoLines.length > 0
            ? fontSize + (infoLines.length - 1) * lineHeight
            : 0;

        let renderedLogoHeight = 50;

        if (logoPath) {
          try {
            const logoImage = (doc as any).openImage(logoPath);
            renderedLogoHeight = logoWidth * (logoImage.height / logoImage.width);

            const textStartY =
              y + (renderedLogoHeight - textBlockHeight) / 2;

            doc.image(logoImage, 35, y, {
              width: logoWidth,
            });

            doc
              .fillColor(COLOR_TEXT_MUTED)
              .font('Helvetica')
              .fontSize(fontSize);

            let lineY = textStartY;
            infoLines.forEach((line) => {
              doc.text(line, companyX, lineY, {
                width: companyBoxWidth,
                lineBreak: false,
                ellipsis: true,
              });
              lineY += lineHeight;
            });
          } catch (e) {
            doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(14).text(settings.companyName || 'CABEN', 35, y);
            doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);
            let lineY = y + 18;
            infoLines.forEach(line => {
              doc.text(line, 35, lineY, { width: 280 });
              lineY += lineHeight;
            });
          }
        } else {
          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(14).text(settings.companyName || 'CABEN', 35, y);
          doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);
          let lineY = y + 18;
          infoLines.forEach(line => {
            doc.text(line, 35, lineY, { width: 280 });
            lineY += lineHeight;
          });
        }

        // Right Side Header (Title & Badge) - Centrado vertical respecto al logo
        const titleFontSize = 16;
        const badgeHeight = 18;
        const rightGap = 5; // Separación entre título y badge
        const rightBlockHeight = titleFontSize + rightGap + badgeHeight;
        const rightStartY = y + (renderedLogoHeight - rightBlockHeight) / 2;

        doc.fillColor(COLOR_TITLE).font('Helvetica-Bold').fontSize(titleFontSize).text('COTIZACIÓN', 360, rightStartY, { align: 'right', width: 217 });
        
        const badgeY = rightStartY + titleFontSize + rightGap;
        const badgeWidth = 110;
        const badgeX = 577 - badgeWidth;
        const badgeFontSize = 8.5;
        const badgeTextY = badgeY + (badgeHeight - badgeFontSize) / 2 + 1.2;
        doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fillAndStroke(COLOR_BLUE_BG, COLOR_BLUE_BORDER);
        doc.fillColor(COLOR_BLUE_TEXT).font('Helvetica-Bold').fontSize(badgeFontSize).text(`Nº: ${quotation.correlative}`, badgeX, badgeTextY, { align: 'center', width: badgeWidth });

        y = y + Math.max(renderedLogoHeight, 48) + 12;

        // --- Divider Line ---
        doc.moveTo(35, y).lineTo(577, y).strokeColor(COLOR_CARD_BORDER).lineWidth(1).stroke();
        y += 18;

        return y;
      };

      currentY = drawHeader(currentY);

      // Dates and Validity formatting
      const createdDate = new Date(quotation.createdAt);
      const dateFormatted = `${createdDate.getDate().toString().padStart(2, '0')}/${(createdDate.getMonth() + 1).toString().padStart(2, '0')}/${createdDate.getFullYear()} ${createdDate.getHours().toString().padStart(2, '0')}:${createdDate.getMinutes().toString().padStart(2, '0')}`;
      
      const validUntilDate = new Date(quotation.validUntil);
      const validUntilFormatted = validUntilDate.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
      const diffTime = Math.abs(validUntilDate.getTime() - createdDate.getTime());
      const validityDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      const branchName = quotation.branch?.name || 'Planta Central';
      const branchAddress = quotation.branch?.address || '';
      const branchPhone = quotation.branch?.phone || '';
      const branchEmail = quotation.branch?.email || '';

      const statusLabels: Record<string, string> = {
        PENDING: 'Pendiente',
        CONVERTED: 'Convertida a Venta',
        EXPIRED: 'Expirada',
        CANCELLED: 'Cancelada',
      };
      const statusLabel = statusLabels[quotation.status] || quotation.status || 'Pendiente';

      // --- 2. Customer Information Card ---
      const customerY = currentY;
      const customerName = (quotation.customer?.name || quotation.guestCustomer?.name || 'Consumidor Final').trim();
      const customerNit = (quotation.customer?.nit || quotation.guestCustomer?.nit || 'C/F').trim();
      const customerAddress = (quotation.customer?.address || quotation.guestCustomer?.address || '').trim();
      const customerPhone = (quotation.customer?.phone || quotation.guestCustomer?.phone || '').trim();

      const colWidth = 235;
      doc.font('Helvetica').fontSize(8.5);
      
      // Calculate heights
      let leftColHeight = 24 + 13 + 13; // header + name + nit
      if (customerPhone) leftColHeight += 13;
      if (customerAddress) {
        leftColHeight += Math.max(13, doc.heightOfString(`Dirección: ${customerAddress}`, { width: colWidth }));
      }

      const rightColHeight = 24 + 13 + 13 + 13 + 13; // header + emisión + validez + sucursal + estado

      const dynamicBoxHeight = Math.max(88, Math.max(leftColHeight, rightColHeight) + 12);
      doc.roundedRect(35, customerY, 542, dynamicBoxHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);

      // Columna 1: Información del Cliente
      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('INFORMACIÓN DEL CLIENTE', 48, customerY + 10);
      let clientY = customerY + 24;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_TEXT_DARK).text('Nombre: ', 48, clientY, { continued: true });
      doc.font('Helvetica').text(customerName);
      clientY += 13;

      doc.font('Helvetica-Bold').text('NIT: ', 48, clientY, { continued: true });
      doc.font('Helvetica').text(customerNit);
      clientY += 13;

      if (customerPhone) {
        doc.font('Helvetica-Bold').text('Teléfono: ', 48, clientY, { continued: true });
        doc.font('Helvetica').text(customerPhone);
        clientY += 13;
      }

      if (customerAddress) {
        doc.font('Helvetica-Bold');
        const addressLabelWidth = doc.widthOfString('Dirección: ');
        doc.text('Dirección: ', 48, clientY);
        doc.font('Helvetica').text(customerAddress, 48 + addressLabelWidth + 3.5, clientY, {
          width: colWidth - addressLabelWidth - 3.5,
          lineBreak: true,
        });
        clientY = Math.max(clientY + 13, doc.y + 2);
      }

      // Columna 2: Detalles de la Emisión
      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('DETALLES DE LA EMISIÓN', 315, customerY + 10);
      let emissionY = customerY + 24;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_TEXT_DARK).text('Fecha de Emisión: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(dateFormatted);
      emissionY += 13;

      doc.font('Helvetica-Bold').text('Validez: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(`${validityDays} días (Vence: ${validUntilFormatted})`);
      emissionY += 13;

      doc.font('Helvetica-Bold').text('Sucursal: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(branchName);
      emissionY += 13;

      doc.font('Helvetica-Bold').text('Estado: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(statusLabel);
      emissionY += 13;

      currentY = customerY + dynamicBoxHeight + 15;

      // --- 3. Items Table ---
      const drawTableHeader = (y: number) => {
        doc.roundedRect(35, y, 542, 22, 3).fill(COLOR_PRIMARY);
        doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(8);
        doc.text('CÓDIGO', 45, y + 6.5, { width: 75 });
        doc.text('PRODUCTO', 125, y + 6.5, { width: 200 });
        doc.text('PRECIO Q.', 330, y + 6.5, { width: 75, align: 'right' });
        doc.text('CANTIDAD', 415, y + 6.5, { width: 70, align: 'right' });
        doc.text('TOTAL Q.', 495, y + 6.5, { width: 72, align: 'right' });
      };

      drawTableHeader(currentY);
      currentY += 22;

      // Agrupar items por producto (igual que en órdenes de venta)
      const groups: {
        productId: string;
        productName: string;
        sku: string;
        unitAbbr: string;
        unitPrice: number;
        items: any[];
        totalQuantity: number;
        totalAmount: number;
      }[] = [];

      (quotation.items || []).forEach((item) => {
        const prodId = item.product?.id || '';
        let group = groups.find((g) => g.productId === prodId);
        if (!group) {
          group = {
            productId: prodId,
            productName: item.product?.name || 'Producto',
            sku: item.product?.sku || 'S/C',
            unitAbbr: item.product?.unit?.abbreviation || '',
            unitPrice: Number(item.unitPrice || 0),
            items: [],
            totalQuantity: 0,
            totalAmount: 0,
          };
          groups.push(group);
        }
        group.items.push(item);
        group.totalQuantity += Number(item.quantity || 0);
        group.totalAmount += Number(item.lineTotal || 0);
      });

      groups.sort((a, b) => a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' }));

      groups.forEach((group) => {
        group.items.forEach((item) => {
          if (currentY > 670) {
            doc.addPage();
            currentY = drawHeader(20);
            drawTableHeader(currentY);
            currentY += 22;
          }

          doc.fillColor(COLOR_TEXT_DARK).font('Helvetica').fontSize(8.5);
          doc.text(group.sku, 45, currentY + 7.5, { width: 75, ellipsis: true });

          let discountText = '';
          if (Number(item.discountAmount) > 0) {
            discountText = ` (Desc: -Q${Number(item.discountAmount).toFixed(2)})`;
          }
          doc.text(`${group.productName}${discountText}`, 125, currentY + 7.5, { width: 200, ellipsis: true });

          doc.text(`Q${Number(item.unitPrice).toFixed(2)}`, 330, currentY + 7.5, { width: 75, align: 'right' });
          const qtyText = group.unitAbbr
            ? `${Number(item.quantity).toFixed(2)} ${group.unitAbbr}`
            : Number(item.quantity).toFixed(2);
          doc.text(qtyText, 415, currentY + 7.5, { width: 70, align: 'right' });
          doc.text(`Q${Number(item.lineTotal).toFixed(2)}`, 495, currentY + 7.5, { width: 72, align: 'right' });

          doc.moveTo(35, currentY + 24).lineTo(577, currentY + 24).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
          currentY += 24;
        });

        // Subtotal de grupo si tiene más de 1 pesaje/ítem
        if (group.items.length > 1) {
          if (currentY > 670) {
            doc.addPage();
            currentY = drawHeader(20);
            drawTableHeader(currentY);
            currentY += 22;
          }

          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(8.5);
          const totalQtyText = group.unitAbbr
            ? `${group.totalQuantity.toFixed(2)} ${group.unitAbbr}`
            : group.totalQuantity.toFixed(2);
          doc.text(totalQtyText, 415, currentY + 5.5, { width: 70, align: 'right' });
          doc.text(`Q${group.totalAmount.toFixed(2)}`, 495, currentY + 5.5, { width: 72, align: 'right' });

          doc.moveTo(415, currentY + 20).lineTo(572, currentY + 20).strokeColor('#CBD5E1').lineWidth(0.5).dash(2, { space: 2 }).stroke().undash();
          currentY += 22;
        }
      });

      // --- 4. Summary and Totals Area ---
      if (currentY > 560) {
        doc.addPage();
        currentY = drawHeader(20);
      }

      currentY += 15;
      const startBottomY = currentY;

      // Izquierda: Términos y Condiciones
      const termsBoxWidth = 270;
      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('TÉRMINOS Y CONDICIONES', 35, startBottomY);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica').fontSize(8).text(
        `• Esta cotización tiene una validez de ${validityDays} días a partir de su emisión.\n` +
        `• Vence oficialmente el día ${validUntilFormatted}.\n` +
        `• Precios y existencias sujetos a cambios sin previo aviso.`,
        35,
        startBottomY + 12,
        { width: termsBoxWidth, lineGap: 2.5 }
      );

      if (quotation.notes) {
        doc.moveDown(0.6);
        doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('NOTAS ADICIONALES:', 35, doc.y);
        doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Oblique').fontSize(8).text(quotation.notes, 35, doc.y + 3, { width: termsBoxWidth });
      }

      // Derecha: Totales
      const hasDiscount = Number(quotation.discountAmount || 0) > 0;
      const hasTax = Number(quotation.taxAmount || 0) > 0;
      let extraLinesCount = 0;
      if (hasDiscount) extraLinesCount++;
      if (hasTax) extraLinesCount++;

      const totalsBoxWidth = 207;
      const totalsBoxX = 577 - totalsBoxWidth;
      const totalsBoxHeight = 46 + extraLinesCount * 13.5;
      doc.roundedRect(totalsBoxX, startBottomY, totalsBoxWidth, totalsBoxHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);

      let tY = startBottomY + 8;
      const labelX = totalsBoxX + 10;
      const valueX = totalsBoxX + 90;
      const valueWidth = totalsBoxWidth - 90 - 10;

      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(8.5).text('Subtotal:', labelX, tY);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica').fontSize(8.5).text(`Q${Number(quotation.subtotal).toFixed(2)}`, valueX, tY, { width: valueWidth, align: 'right' });
      tY += 13.5;

      if (hasDiscount) {
        doc.fillColor(COLOR_TEXT_MUTED).text('Descuento:', labelX, tY);
        doc.fillColor('#DC2626').text(`-Q${Number(quotation.discountAmount).toFixed(2)}`, valueX, tY, { width: valueWidth, align: 'right' });
        tY += 13.5;
      }

      if (hasTax) {
        doc.fillColor(COLOR_TEXT_MUTED).text('Impuestos:', labelX, tY);
        doc.fillColor(COLOR_TEXT_DARK).text(`Q${Number(quotation.taxAmount).toFixed(2)}`, valueX, tY, { width: valueWidth, align: 'right' });
        tY += 13.5;
      }

      doc.moveTo(totalsBoxX + 10, tY).lineTo(totalsBoxX + totalsBoxWidth - 10, tY).strokeColor(COLOR_CARD_BORDER).lineWidth(1).stroke();
      tY += 7;

      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(10.5).text('TOTAL:', labelX, tY);
      doc.text(`Q${Number(quotation.total).toFixed(2)}`, valueX, tY, { width: valueWidth, align: 'right' });

      // --- 5. Render Fixed Footer on all pages ---
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);

        doc.moveTo(35, 700).lineTo(577, 700).strokeColor(COLOR_CARD_BORDER).lineWidth(1).stroke();

        doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(8.5).text('¡Gracias por su preferencia!', 35, 712, { align: 'center', width: 542 });
        doc.fontSize(8).text('Cotización Informativa - Sujeta a disponibilidad y términos comerciales', 35, 724, { align: 'center', width: 542 });
        doc.fontSize(7.5).text('Precios y disponibilidad válidos hasta la fecha de vigencia estipulada', 35, 742, { align: 'center', width: 542 });
      }

      doc.end();
    });
  }
}
