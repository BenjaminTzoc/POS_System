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

  async generateWeeklyConsolidatedPdf(data: {
    customer?: {
      name?: string;
      nit?: string;
      phone?: string;
      address?: string;
      categoryName?: string;
      lastPurchaseDate?: string | Date | null;
    };
    emission?: {
      date?: string | Date;
      branchName?: string;
      weekRange?: string;
      reportType?: string;
      status?: string;
      [key: string]: any;
    };
    metrics?: {
      totalSpent?: number;
      orderCount?: number;
      avgTicket?: number;
    };
    days?: Array<{ day: string; total: number }>;
    financial?: {
      paidAmount?: number;
      pendingAmount?: number;
      creditLimit?: number;
      creditUsed?: number;
    };
    mix?: Array<{
      productName: string;
      quantity: number;
      unit: string;
      revenue: number;
      share: number;
    }>;
    [key: string]: any;
  }): Promise<Buffer> {
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
      const COLOR_CYAN_BG = '#BAE6FD';      // Sky/Cyan 200 banner
      const COLOR_BLUE_BG = '#EFF6FF';      // Blue 50
      const COLOR_BLUE_BORDER = '#BFDBFE';  // Blue 200
      const COLOR_BLUE_TEXT = '#1E40AF';    // Blue 800
      const COLOR_CARD_BG = '#FFFFFF';      // Slate / White
      const COLOR_CARD_BORDER = '#94A3B8';  // Slate border
      const COLOR_TEXT_MUTED = '#475569';   // Slate 600
      const COLOR_TEXT_DARK = '#0F172A';    // Slate 900

      let currentY = 28;

      // --- 1. Logo / Header Banner Section ---
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
        const bannerWidth = 542;
        const bannerHeight = 72;
        const bannerRadius = 10;

        // Draw light-blue / cyan rounded container
        doc.roundedRect(35, y, bannerWidth, bannerHeight, bannerRadius).fill(COLOR_CYAN_BG);

        // Exact Logo & Info specs matching generateInvoicePdf / generatePaymentReceiptPdf
        const logoWidth = 70;
        const logoX = 48;
        const companyX = logoX + logoWidth + 14; // 132
        const companyBoxWidth = 200;

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
            const actualLogoY = y + (bannerHeight - renderedLogoHeight) / 2;
            const textStartY = y + (bannerHeight - textBlockHeight) / 2;

            doc.image(logoImage, logoX, actualLogoY, { width: logoWidth });

            doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);

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
            doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(14).text(settings.companyName || 'CABEN', logoX, y + 20);
            doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);
            let lineY = y + 16;
            infoLines.forEach((line) => {
              doc.text(line, companyX, lineY, { width: companyBoxWidth, lineBreak: false, ellipsis: true });
              lineY += lineHeight;
            });
          }
        } else {
          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(14).text(settings.companyName || 'CABEN', logoX, y + 20);
          doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(fontSize);
          let lineY = y + 16;
          infoLines.forEach((line) => {
            doc.text(line, companyX, lineY, { width: companyBoxWidth, lineBreak: false, ellipsis: true });
            lineY += lineHeight;
          });
        }

        // Right Side Header (Title & Badge con fechas) - Idéntico a los recibos existentes
        const titleFontSize = 16;
        const badgeHeight = 18;
        const rightGap = 5;
        const rightBlockHeight = titleFontSize + rightGap + badgeHeight;
        const rightStartY = y + (bannerHeight - rightBlockHeight) / 2;

        doc.fillColor(COLOR_TITLE)
          .font('Helvetica-Bold')
          .fontSize(titleFontSize)
          .text('CONSOLIDADO SEMANAL', 340, rightStartY, { align: 'right', width: 222 });

        const dateRangeText = data.emission?.weekRange || 'Semana Actual';
        doc.font('Helvetica').fontSize(8.5);
        const textWidth = doc.widthOfString(dateRangeText);
        const badgeWidth = Math.max(120, Math.min(200, textWidth + 16));
        const badgeX = 562 - badgeWidth;
        const badgeY = rightStartY + titleFontSize + rightGap;
        const badgeFontSize = 8.5;
        const badgeTextY = badgeY + (badgeHeight - badgeFontSize) / 2 + 1.2;

        doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fillAndStroke(COLOR_BLUE_BG, COLOR_BLUE_BORDER);
        doc.fillColor(COLOR_TEXT_DARK)
          .font('Helvetica')
          .fontSize(badgeFontSize)
          .text(dateRangeText, badgeX, badgeTextY, { align: 'center', width: badgeWidth });

        y += bannerHeight + 14;
        return y;
      };

      currentY = drawHeader(currentY);

      // --- 2. Information Section (Customer & Emission Details) ---
      const infoBoxY = currentY;

      const customerName = (data.customer?.name || 'Consumidor Final').trim();
      const customerNit = (data.customer?.nit || 'C/F').trim();
      const customerPhone = (data.customer?.phone || '').trim();
      const customerAddress = (data.customer?.address || '').trim();
      const customerCategory = (data.customer?.categoryName || '').trim();

      // Formatear fecha de emisión
      const now = data.emission?.date ? new Date(data.emission.date) : new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const emissionDateStr = `${day}/${month}/${year} ${hours}:${minutes}`;

      const branchName = (data.emission?.branchName || 'Todas las sucursales').trim();
      const weekRange = (data.emission?.weekRange || 'Semana seleccionada').trim();
      const reportType = (data.emission?.reportType || 'Consolidado por Cliente').trim();

      doc.font('Helvetica').fontSize(8.5);
      const colWidth = 235;

      let leftColHeight = 24 + 13 + 13; // header + Nombre + NIT
      if (customerPhone) leftColHeight += 13;
      if (customerCategory) leftColHeight += 13;
      if (customerAddress) {
        leftColHeight += Math.max(13, doc.heightOfString(`Dirección: ${customerAddress}`, { width: colWidth }));
      }

      let rightColHeight = 24 + 13 + 13 + 13; // header + Fecha Emisión + Periodo + Sucursal
      if (reportType) rightColHeight += 13;

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

      if (customerCategory) {
        doc.font('Helvetica-Bold').text('Categoría: ', 48, clientY, { continued: true });
        doc.font('Helvetica').text(customerCategory);
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

      // Columna 2: Detalles de la emisión
      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('DETALLES DE LA EMISIÓN', 315, infoBoxY + 10);

      let emissionY = infoBoxY + 24;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_TEXT_DARK).text('Fecha de Emisión: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(emissionDateStr);
      emissionY += 13;

      doc.font('Helvetica-Bold').text('Periodo: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(weekRange);
      emissionY += 13;

      doc.font('Helvetica-Bold').text('Sucursal: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(branchName);
      emissionY += 13;

      doc.font('Helvetica-Bold').text('Tipo: ', 315, emissionY, { continued: true });
      doc.font('Helvetica').text(reportType);
      emissionY += 13;

      currentY = infoBoxY + dynamicBoxHeight + 14;

      // --- 3. Top Metrics Cards (Gastó, Pedidos, Prom. x pedido) ---
      const totalSpent = Number(data.metrics?.totalSpent || 0);
      const orderCount = Number(data.metrics?.orderCount || 0);
      const avgTicket = Number(data.metrics?.avgTicket || (orderCount > 0 ? totalSpent / orderCount : 0));

      const cardWidth = 172;
      const cardHeight = 46;
      const cardGap = 13;
      const cardStartX = 35;
      const cardsY = currentY;

      // Card 1: Gastó
      doc.roundedRect(cardStartX, cardsY, cardWidth, cardHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);
      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('Gastó', cardStartX + 12, cardsY + 8);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(12.5).text(`Q${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`, cardStartX + 12, cardsY + 22);

      // Card 2: Pedidos
      const card2X = cardStartX + cardWidth + cardGap;
      doc.roundedRect(card2X, cardsY, cardWidth, cardHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);
      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('Pedidos', card2X + 12, cardsY + 8);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(12.5).text(`${orderCount}`, card2X + 12, cardsY + 22);

      // Card 3: Prom. x pedido
      const card3X = card2X + cardWidth + cardGap;
      doc.roundedRect(card3X, cardsY, cardWidth, cardHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);
      doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(8).text('Prom. x pedido', card3X + 12, cardsY + 8);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(12.5).text(`Q${avgTicket.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`, card3X + 12, cardsY + 22);

      currentY = cardsY + cardHeight + 14;

      // --- 4. Chart: Gastos por día (Lun - Dom) ---
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(10).text('Gastos por día', 35, currentY, { align: 'center', width: 542 });
      currentY += 14;

      const chartY = currentY;
      const chartWidth = 542;
      const daysLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const daysData: Array<{ day: string; total: number }> = data.days || [
        { day: 'Lun', total: 0 },
        { day: 'Mar', total: totalSpent },
        { day: 'Mié', total: 0 },
        { day: 'Jue', total: 0 },
        { day: 'Vie', total: 0 },
        { day: 'Sáb', total: 0 },
        { day: 'Dom', total: 0 },
      ];

      const maxDayValue = Math.max(...daysData.map((d) => Number(d.total || 0)), 1);
      const colSlotWidth = chartWidth / 7;
      const barWidth = 46;
      const maxBarHeight = 105;
      const baseLineY = chartY + maxBarHeight + 5;
      const COLOR_BAR = '#4A041E';       // Dark wine/burgundy bar
      const COLOR_BAR_MUTED = '#E2E8F0'; // Base divider line

      daysData.forEach((d, idx) => {
        const slotCenterX = 35 + idx * colSlotWidth + colSlotWidth / 2;
        const barX = slotCenterX - barWidth / 2;
        const dayVal = Number(d.total || 0);

        if (dayVal > 0) {
          const barH = Math.max(10, (dayVal / maxDayValue) * maxBarHeight);
          const barY = baseLineY - barH;
          doc.roundedRect(barX, barY, barWidth, barH, 4).fill(COLOR_BAR);

          // Valor encima/debajo
          doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(7.5).text(`Q${dayVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, slotCenterX - 35, baseLineY + 6, { width: 70, align: 'center' });
        } else {
          // Dash o guión cuando es 0
          doc.moveTo(slotCenterX - 8, baseLineY - 2).lineTo(slotCenterX + 8, baseLineY - 2).strokeColor(COLOR_BAR_MUTED).lineWidth(1.5).stroke();
        }

        // Línea base suave
        doc.moveTo(35 + idx * colSlotWidth + 4, baseLineY).lineTo(35 + (idx + 1) * colSlotWidth - 4, baseLineY).strokeColor('#E2E8F0').lineWidth(1).stroke();

        // Label del día
        doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(8.5).text(daysLabels[idx] || d.day, slotCenterX - 20, baseLineY + 18, { width: 40, align: 'center' });
      });

      currentY = baseLineY + 34;

      // --- 5. Bottom Status Cards (Cobrado, Saldo pendiente & Crédito) ---
      const bottomCardWidth = 172;
      const bottomCardHeight = 48;
      const bottomCardGap = 13;
      const bCard1X = 35;
      const bCard2X = bCard1X + bottomCardWidth + bottomCardGap;
      const bCard3X = bCard2X + bottomCardWidth + bottomCardGap;
      const bCardY = currentY;

      const paidAmount = Number(data.financial?.paidAmount || 0);
      const pendingAmount = Number(data.financial?.pendingAmount || 0);
      const creditLimit = Number(data.financial?.creditLimit || 0);
      const creditUsed = Number(data.financial?.creditUsed || 0);
      const creditPercent = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : (creditUsed > 0 ? 100 : 0);

      // Card 1: Cobrado
      doc.roundedRect(bCard1X, bCardY, bottomCardWidth, bottomCardHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(8.5).text('Cobrado', bCard1X + 12, bCardY + 8);
      doc.fillColor('#0D9488').font('Helvetica-Bold').fontSize(10.5).text(`Q${paidAmount.toFixed(2)}`, bCard1X + 12, bCardY + 22);

      // Card 2: Saldo pendiente
      doc.roundedRect(bCard2X, bCardY, bottomCardWidth, bottomCardHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(8.5).text('Saldo pendiente', bCard2X + 12, bCardY + 8);
      doc.fillColor(pendingAmount > 0 ? '#E11D48' : COLOR_TEXT_MUTED).font('Helvetica-Bold').fontSize(10.5).text(`Q${pendingAmount.toFixed(2)}`, bCard2X + 12, bCardY + 22);

      // Card 3: Crédito
      doc.roundedRect(bCard3X, bCardY, bottomCardWidth, bottomCardHeight, 6).fillAndStroke(COLOR_CARD_BG, COLOR_CARD_BORDER);
      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(8.5).text('Crédito', bCard3X + 12, bCardY + 8);
      if (creditLimit > 0) {
        doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(10.5).text(`${creditPercent}% usado`, bCard3X + 12, bCardY + 22);
        doc.fillColor(COLOR_TEXT_MUTED).font('Helvetica').fontSize(7.5).text(`Q${creditUsed.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / Q${creditLimit.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, bCard3X + 12, bCardY + 36);
      } else {
        doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(10.5).text('Sin línea', bCard3X + 12, bCardY + 22);
      }

      currentY = bCardY + bottomCardHeight + 14;

      // --- 6. Productos más consumidos (Top Products con Progress Bar) ---
      const mixItems = data.mix || [];

      if (mixItems.length > 0) {
        doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(10).text('Productos más consumidos', 35, currentY, { align: 'center', width: 542 });
        currentY += 14;

        const progressTrackWidth = 542;
        const progressBarHeight = 6;
        const progressBgColor = '#F1F5F9';

        mixItems.slice(0, 5).forEach((item) => {
          const pName = item.productName || 'Producto';
          const pQty = `${Number(item.quantity || 0).toLocaleString('en-US')} ${item.unit || 'lb'}`.trim();
          const pRevenue = `Q${Number(item.revenue || 0).toLocaleString('en-US')} · ${Math.round(item.share || 0)}%`;

          // Row 1: Nombre a la izquierda, Total y porcentaje a la derecha
          doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(9.5).text(pName, 35, currentY, { width: 340, ellipsis: true });
          doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(9.5).text(pRevenue, 377, currentY, { width: 200, align: 'right' });
          currentY += 13;

          // Row 2: Barra de progreso
          const barWidth = Math.max(4, Math.min(progressTrackWidth, (Math.min(100, Math.max(0, item.share || 0)) / 100) * progressTrackWidth));
          doc.roundedRect(35, currentY, progressTrackWidth, progressBarHeight, 3).fill(progressBgColor);
          doc.roundedRect(35, currentY, barWidth, progressBarHeight, 3).fill(COLOR_BAR);
          currentY += progressBarHeight + 3;

          // Row 3: Cantidad con unidad
          doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(8).text(pQty, 35, currentY);
          currentY += 14;
        });

        currentY += 2;
      }

      // --- 7. Footer Info: Última compra ---
      const lastPurchaseStr = data.customer?.lastPurchaseDate
        ? (() => {
            const lp = new Date(data.customer.lastPurchaseDate);
            return `${String(lp.getDate()).padStart(2, '0')}/${String(lp.getMonth() + 1).padStart(2, '0')}/${lp.getFullYear()}`;
          })()
        : 'Sin registro previo';

      doc.fillColor(COLOR_TEXT_DARK).font('Helvetica-Bold').fontSize(8.5).text('Última compra: ', 35, currentY, { continued: true });
      doc.font('Helvetica').text(lastPurchaseStr);

      doc.end();
    });
  }
}

