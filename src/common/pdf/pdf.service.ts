import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Quotation, Sale } from '../../sales/entities';
import { join } from 'path';
import { existsSync } from 'fs';
import { CompanySettingService } from '../../settings/services/company-setting.service';
@Injectable()
export class PdfService {
  constructor(private readonly settingService: CompanySettingService) {}

  async generateInvoicePdf(sale: Sale): Promise<Buffer> {
    const settings = await this.settingService.getSettings();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'letter' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', (err) => {
        reject(err);
      });

      // --- Premium Color Palette ---
      const COLOR_PRIMARY = '#1A273A';      // Deep slate blue for headers
      const COLOR_SECONDARY = '#3B4A6B';    // Card headers
      const COLOR_TEXT = '#3E4A62';         // Body text
      const COLOR_MUTED = '#627CA7';        // Muted label text
      const COLOR_ACCENT = '#0C8ABC';       // Ocean blue for line accents
      const COLOR_RUST = '#C24D2C';         // Rust orange for grand total highlight
      const COLOR_BG_LIGHT = '#F4F7FC';     // Light card fill
      const COLOR_BORDER = '#DAEAF7';       // Elegant borders
      const COLOR_WHITE = '#FFFFFF';

      // --- 1. Top Decorative Bar ---
      doc.rect(0, 0, 612, 8).fill(COLOR_PRIMARY);

      // --- 2. Logo / Header Column Setup ---
      let headerY = 25;

      // Try to find the logo in several potential locations
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

      if (logoPath) {
        try {
          doc.image(logoPath, 40, headerY, { width: 110 });
          // Company settings info next to logo (No redundant company name title)
          doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8.5);
          doc.text(settings.address, 165, headerY + 10, { width: 220 });
          doc.text(`Tel: ${settings.phone}`, 165, doc.y + 2, { width: 220 });
          doc.text(`NIT: ${settings.nit}`, 165, doc.y + 2, { width: 220 });
        } catch (e) {
          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(22).text(settings.companyName, 40, headerY);
          doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Carnes y Embutidos', 40, headerY + 24);
        }
      } else {
        doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(22).text(settings.companyName, 40, headerY);
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Carnes y Embutidos', 40, headerY + 24);
      }

      // Right Column: Badge & Metadata
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(20).text('NOTA DE CARGO', 340, headerY, { align: 'right', width: 232 });

      // Badge / Pill
      const badgeY = headerY + 26;
      doc.roundedRect(397, badgeY, 175, 24, 4).fill(COLOR_BORDER);
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(11).text(sale.invoiceNumber, 397, badgeY + 6, { align: 'center', width: 175 });

      // Dates and Metadata
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8.5);
      const dateString = new Date(sale.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      
      doc.text(`Fecha de Emisión: ${dateString}`, 340, badgeY + 34, { align: 'right', width: 232 });
      doc.text(`Estado: ${sale.status}`, 340, doc.y, { align: 'right', width: 232 });

      // --- 3. Divider ---
      const dividerY = 175;
      doc.moveTo(40, dividerY).lineTo(572, dividerY).strokeColor(COLOR_BORDER).lineWidth(1).stroke();

      // --- 4. Customer Information Card ---
      const customerY = 188;
      doc.roundedRect(40, customerY, 532, 78, 4).fill(COLOR_BG_LIGHT);
      
      const customerName = sale.customer ? sale.customer.name : sale.guestCustomer?.name || 'Consumidor Final';
      const customerNit = sale.customer ? sale.customer.nit : sale.guestCustomer?.nit || 'C/F';
      const customerAddress = sale.customer ? sale.customer.address : sale.guestCustomer?.address || 'Ciudad';
      const customerEmail = sale.customer ? sale.customer.email : sale.guestCustomer?.email || 'N/A';
      const customerPhone = sale.customer ? sale.customer.phone : sale.guestCustomer?.phone || 'N/A';

      // Left Column inside Customer Card
      doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('INFORMACIÓN DEL CLIENTE', 52, customerY + 8);
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(11).text(customerName, 52, customerY + 20, { width: 240, ellipsis: true });
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9);
      doc.text(`Dirección: ${customerAddress}`, 52, customerY + 36, { width: 240, height: 26, ellipsis: true });

      // Right Column inside Customer Card
      doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('DETALLES DE CONTACTO', 320, customerY + 8);
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9);
      doc.text(`NIT / ID: ${customerNit}`, 320, customerY + 20);
      doc.text(`Teléfono: ${customerPhone}`, 320, customerY + 33);
      doc.text(`Email: ${customerEmail}`, 320, customerY + 46, { width: 220, ellipsis: true });

      // --- 5. Table of Products ---
      let currentY = 280;

      // Table Header Draw Function
      const drawTableHeader = (y: number) => {
        doc.roundedRect(40, y, 532, 24, 2).fill(COLOR_PRIMARY);
        doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(8.5);
        doc.text('CÓDIGO', 50, y + 7.5, { width: 70 });
        doc.text('NOMBRE', 130, y + 7.5, { width: 190 });
        doc.text('PRECIO Q.', 330, y + 7.5, { width: 75, align: 'right' });
        doc.text('CANTIDAD', 415, y + 7.5, { width: 70, align: 'right' });
        doc.text('TOTAL Q.', 495, y + 7.5, { width: 70, align: 'right' });
      };

      drawTableHeader(currentY);
      currentY += 24;

      // Group Details by Product
      const groups: {
        productId: string;
        productName: string;
        sku: string;
        items: any[];
        totalQuantity: number;
        totalAmount: number;
      }[] = [];

      sale.details.forEach((detail) => {
        const prodId = detail.product?.id || '';
        let group = groups.find((g) => g.productId === prodId);
        if (!group) {
          group = {
            productId: prodId,
            productName: detail.product?.name || 'Producto',
            sku: detail.product?.sku || '',
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

      // Render rows
      groups.forEach((group) => {
        // Render each weigh item
        group.items.forEach((item) => {
          if (currentY > 700) {
            doc.addPage();
            doc.rect(0, 0, 612, 8).fill(COLOR_PRIMARY);
            currentY = 40;
            drawTableHeader(currentY);
            currentY += 24;
          }

          doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8.5);
          doc.text(group.sku, 50, currentY + 6, { width: 70 });
          
          let discountStr = '';
          if (Number(item.discountAmount) > 0) {
            discountStr = `\n(Desc: -Q${Number(item.discountAmount).toFixed(2)})`;
          }
          doc.text(`${group.productName}${discountStr}`, 130, currentY + 6, { width: 190 });
          
          doc.text(`Q${Number(item.unitPrice).toFixed(2)}`, 330, currentY + 6, { width: 75, align: 'right' });
          doc.text(Number(item.quantity).toFixed(2), 415, currentY + 6, { width: 70, align: 'right' });
          
          doc.font('Helvetica-Bold').fillColor(COLOR_PRIMARY);
          doc.text(`Q${Number(item.lineTotal).toFixed(2)}`, 495, currentY + 6, { width: 70, align: 'right' });

          doc.moveTo(40, currentY + 22).lineTo(572, currentY + 22).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
          currentY += 22;
        });

        // Render subtotal if more than 1 item
        if (group.items.length > 1) {
          if (currentY > 700) {
            doc.addPage();
            doc.rect(0, 0, 612, 8).fill(COLOR_PRIMARY);
            currentY = 40;
            drawTableHeader(currentY);
            currentY += 24;
          }

          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(8.5);
          doc.text(group.totalQuantity.toFixed(2), 415, currentY + 5.5, { width: 70, align: 'right' });
          doc.text(`Q${group.totalAmount.toFixed(2)}`, 495, currentY + 5.5, { width: 70, align: 'right' });

          doc.moveTo(40, currentY + 20).lineTo(572, currentY + 20).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
          currentY += 20;
        }

        currentY += 5; // spacing between product groups
      });

      // --- 6. Totals and Payments Area ---
      if (currentY > 580) {
        doc.addPage();
        doc.rect(0, 0, 612, 8).fill(COLOR_PRIMARY);
        currentY = 40;
      }

      currentY += 15;
      const startTotalsY = currentY;

      // Left Side: Payments
      if (sale.payments && sale.payments.length > 0) {
        doc.roundedRect(40, currentY, 250, 110, 4).fill('#FAF5FF').strokeColor('#F3E8FF').lineWidth(1).stroke();
        doc.fillColor('#7C3AED').font('Helvetica-Bold').fontSize(8.5).text('DETALLE DE PAGOS', 52, currentY + 8);

        let payY = currentY + 22;
        sale.payments.forEach((p) => {
          doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8.5);
          doc.text(p.paymentMethod?.name || 'Pago', 52, payY, { width: 120 });
          doc.font('Helvetica-Bold').text(`Q${Number(p.amount).toFixed(2)}`, 180, payY, { width: 100, align: 'right' });
          payY += 15;
        });
      }

      // Right Side: Totals block
      const rightX = 320;
      doc.roundedRect(rightX, currentY, 252, 110, 4).fill(COLOR_BG_LIGHT).strokeColor(COLOR_BORDER).lineWidth(1).stroke();

      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9);
      doc.text('Subtotal:', rightX + 12, currentY + 12, { width: 120 });
      doc.text(`Q${Number(sale.subtotal).toFixed(2)}`, rightX + 140, currentY + 12, { width: 100, align: 'right' });

      let offset = 27;
      if (Number(sale.discountAmount) > 0) {
        doc.text('Descuento:', rightX + 12, currentY + offset, { width: 120 });
        doc.text(`-Q${Number(sale.discountAmount).toFixed(2)}`, rightX + 140, currentY + offset, { width: 100, align: 'right' });
        offset += 15;
      }

      if (Number(sale.taxAmount) > 0) {
        doc.text('Impuestos:', rightX + 12, currentY + offset, { width: 120 });
        doc.text(`Q${Number(sale.taxAmount).toFixed(2)}`, rightX + 140, currentY + offset, { width: 100, align: 'right' });
        offset += 15;
      }

      doc.moveTo(rightX + 12, currentY + offset).lineTo(rightX + 240, currentY + offset).strokeColor(COLOR_BORDER).lineWidth(1).stroke();
      offset += 8;

      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(11);
      doc.text('TOTAL:', rightX + 12, currentY + offset, { width: 120 });
      doc.text(`Q${Number(sale.total).toFixed(2)}`, rightX + 140, currentY + offset, { width: 100, align: 'right' });

      // --- Footer ---
      doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8.5).text('¡Gracias por su preferencia!', 40, 710, { align: 'center', width: 532 });
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8).text('Control Interno - No válido como Factura Tributaria', 40, 725, { align: 'center', width: 532 });
      doc.fontSize(7.5).text('Documento para validación y conciliación de cargos', 40, 737, { align: 'center', width: 532 });

      doc.end();
    });
  }

  async generateQuotationPdf(quotation: Quotation): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', (err) => {
        reject(err);
      });

      // --- Premium Color Palette ---
      const COLOR_PRIMARY = '#1A273A';      // Deep slate blue for headers
      const COLOR_SECONDARY = '#3B4A6B';    // Card headers
      const COLOR_TEXT = '#3E4A62';         // Body text
      const COLOR_MUTED = '#627CA7';        // Muted label text
      const COLOR_ACCENT = '#0C8ABC';       // Ocean blue for line accents
      const COLOR_RUST = '#C24D2C';         // Rust orange for grand total highlight
      const COLOR_BG_LIGHT = '#F4F7FC';     // Light card fill
      const COLOR_BORDER = '#DAEAF7';       // Elegant borders
      const COLOR_WHITE = '#FFFFFF';

      // --- 1. Top Decorative Bar ---
      doc.rect(0, 0, 595.28, 8).fill(COLOR_PRIMARY);

      // --- 2. Logo / Header Column Setup ---
      let headerY = 25;

      // Try to find the logo in several potential locations
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

      if (logoPath) {
        try {
          doc.image(logoPath, 40, headerY, { width: 110 });
        } catch (e) {
          // Fallback to text if image loading fails
          doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(22).text('CABEN', 40, headerY);
          doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Soluciones POS', 40, headerY + 24);
        }
      } else {
        // Fallback typography logo
        doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(22).text('CABEN', 40, headerY);
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Soluciones POS', 40, headerY + 24);
      }

      // Branch details under logo/text
      const branchName = quotation.branch?.name || 'Sucursal Principal';
      const branchAddress = quotation.branch?.address || '';
      const branchPhone = quotation.branch?.phone || '';
      const branchEmail = quotation.branch?.email || '';

      // Compute branch details Y dynamically to avoid overlap if logo image is present
      const branchDetailsY = logoPath ? headerY + 115 : headerY + 40;

      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8.5);
      doc.text(branchName, 40, branchDetailsY, { width: 250 });
      if (branchAddress) {
        doc.text(branchAddress, 40, doc.y, { width: 250 });
      }
      doc.text(`Tel: ${branchPhone || 'N/A'} ${branchEmail ? ` | Email: ${branchEmail}` : ''}`, 40, doc.y, { width: 250 });

      // Right Column: Quotation Badge & Metadata
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(20).text('COTIZACIÓN', 340, headerY, { align: 'right', width: 215 });

      // Correlative Badge / Pill
      const badgeY = headerY + 26;
      doc.roundedRect(360, badgeY, 195, 24, 4).fill(COLOR_BORDER);
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(11).text(quotation.correlative, 360, badgeY + 6, { align: 'center', width: 195 });

      // Dates and Metadata
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8.5);
      const dateString = new Date(quotation.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
      const validUntilString = new Date(quotation.validUntil).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
      
      const diffTime = Math.abs(quotation.validUntil.getTime() - quotation.createdAt.getTime());
      const validityDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      doc.text(`Fecha de Emisión: ${dateString}`, 340, badgeY + 34, { align: 'right', width: 215 });
      doc.text(`Validez: ${validityDays} días (Vence el ${validUntilString})`, 340, doc.y, { align: 'right', width: 215 });

      // --- 3. Divider ---
      const dividerY = 175;
      doc.moveTo(40, dividerY).lineTo(555, dividerY).strokeColor(COLOR_BORDER).lineWidth(1).stroke();

      // --- 4. Customer Information Card ---
      const customerY = 188;
      // Draw sub-card container
      doc.roundedRect(40, customerY, 515, 78, 4).fill(COLOR_BG_LIGHT);
      
      const customerName = quotation.customer ? quotation.customer.name : quotation.guestCustomer?.name || 'Consumidor Final';
      const customerNit = quotation.customer ? quotation.customer.nit : quotation.guestCustomer?.nit || 'C/F';
      const customerAddress = quotation.customer ? quotation.customer.address : quotation.guestCustomer?.address || 'Ciudad';
      const customerEmail = quotation.customer ? quotation.customer.email : quotation.guestCustomer?.email || 'N/A';
      const customerPhone = quotation.customer ? quotation.customer.phone : quotation.guestCustomer?.phone || 'N/A';

      // Left Column inside Customer Card
      doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('INFORMACIÓN DEL CLIENTE', 52, customerY + 8);
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').fontSize(11).text(customerName, 52, customerY + 20, { width: 240, ellipsis: true });
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9);
      doc.text(`Dirección: ${customerAddress}`, 52, customerY + 36, { width: 240, height: 26, ellipsis: true });

      // Right Column inside Customer Card
      doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('DETALLES DE CONTACTO', 320, customerY + 8);
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9);
      doc.text(`NIT / ID: ${customerNit}`, 320, customerY + 20);
      doc.text(`Teléfono: ${customerPhone}`, 320, customerY + 33);
      doc.text(`Email: ${customerEmail}`, 320, customerY + 46, { width: 220, ellipsis: true });

      // --- 5. Table of Products ---
      let currentY = 280;

      // Table Header Draw Function
      const drawTableHeader = (y: number) => {
        doc.roundedRect(40, y, 515, 24, 2).fill(COLOR_PRIMARY);
        doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(8.5);
        doc.text('PRODUCTO', 50, y + 7.5, { width: 240 });
        doc.text('CANTIDAD', 300, y + 7.5, { width: 70, align: 'center' });
        doc.text('PRECIO UNIT.', 380, y + 7.5, { width: 85, align: 'right' });
        doc.text('TOTAL', 475, y + 7.5, { width: 70, align: 'right' });
      };

      drawTableHeader(currentY);
      currentY += 24;

      // Table Rows
      quotation.items.forEach((item, index) => {
        // Page break calculation
        if (currentY > 700) {
          doc.addPage();
          // Draw top accent bar on new page
          doc.rect(0, 0, 595.28, 8).fill(COLOR_PRIMARY);
          currentY = 40;
          drawTableHeader(currentY);
          currentY += 24;
        }

        // Row background
        const rowHeight = 24;
        if (index % 2 === 1) {
          doc.rect(40, currentY, 515, rowHeight).fill('#F8FAFC');
        }

        // Values
        const unitPriceAdjusted = (Number(item.lineTotal) - Number(item.taxAmount)) / Number(item.quantity);
        const rowTotal = unitPriceAdjusted * Number(item.quantity);

        doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9);
        doc.text(item.product?.name || 'Producto', 50, currentY + 7, { width: 240, height: 14, ellipsis: true });
        
        doc.text(Number(item.quantity).toFixed(2), 300, currentY + 7, { width: 70, align: 'center' });
        doc.text(`Q${unitPriceAdjusted.toFixed(2)}`, 380, currentY + 7, { width: 85, align: 'right' });
        
        doc.font('Helvetica-Bold').fillColor(COLOR_PRIMARY);
        doc.text(`Q${rowTotal.toFixed(2)}`, 475, currentY + 7, { width: 70, align: 'right' });

        // Line bottom border
        doc.moveTo(40, currentY + rowHeight).lineTo(555, currentY + rowHeight).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

        currentY += rowHeight;
      });

      // --- 6. Summary and Footer Area ---
      // Check space for totals block
      if (currentY > 640) {
        doc.addPage();
        // Draw top accent bar on new page
        doc.rect(0, 0, 595.28, 8).fill(COLOR_PRIMARY);
        currentY = 40;
      }

      currentY += 15;

      // Left Column: Note / Legal Information
      doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('TÉRMINOS Y CONDICIONES', 40, currentY);
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(8).text(
        `• Esta cotización tiene una validez de ${validityDays} días a partir de su emisión.\n` +
        `• Vence oficialmente el día ${validUntilString}.\n` +
        `• Pasado este periodo, los precios y existencias pueden estar sujetos a cambios sin previo aviso.`,
        40,
        currentY + 12,
        { width: 270, lineGap: 3 }
      );

      if (quotation.notes) {
        doc.moveDown(0.8);
        doc.fillColor(COLOR_MUTED).font('Helvetica-Bold').fontSize(8).text('NOTAS', 40, doc.y);
        doc.fillColor(COLOR_TEXT).font('Helvetica-Oblique').fontSize(8).text(quotation.notes, 40, doc.y + 4, { width: 270 });
      }

      // Right Column: Financial Totals Block
      const totalsX = 350;
      let totalsY = currentY;

      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Sub Total (sin impuestos):', totalsX, totalsY, { width: 120 });
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').text(`Q${Number(quotation.subtotal - quotation.discountAmount).toFixed(2)}`, 480, totalsY, { align: 'right', width: 75 });

      totalsY += 18;
      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9).text('Impuestos (IVA 12%):', totalsX, totalsY, { width: 120 });
      doc.fillColor(COLOR_PRIMARY).font('Helvetica-Bold').text(`Q${Number(quotation.taxAmount).toFixed(2)}`, 480, totalsY, { align: 'right', width: 75 });

      totalsY += 22;
      // Grand Total Solid Box with Rust Accent Color (#C24D2C)
      doc.roundedRect(totalsX - 5, totalsY - 4, 210, 26, 4).fill(COLOR_RUST);
      doc.fillColor(COLOR_WHITE).font('Helvetica-Bold').fontSize(11).text('TOTAL', totalsX + 8, totalsY + 4);
      doc.fontSize(12).text(`Q${Number(quotation.total).toFixed(2)}`, 450, totalsY + 3, { align: 'right', width: 95 });

      // --- 7. Page Footer (Fixed at the bottom of the last page) ---
      const footerY = 765;
      doc.moveTo(40, footerY - 5).lineTo(555, footerY - 5).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8.5);
      doc.text('¡Gracias por confiar en nuestras soluciones!', 40, footerY + 2, { align: 'center', width: 515 });
      
      const detailsText = `Dirección: ${branchAddress || 'N/A'}  |  Teléfono: ${branchPhone || 'N/A'}  |  Email: ${branchEmail || 'N/A'}`;
      doc.fillColor(COLOR_TEXT).fontSize(7.5).text(detailsText, 40, footerY + 14, { align: 'center', width: 515 });

      doc.end();
    });
  }
}
