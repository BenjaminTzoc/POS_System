import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Quotation, Sale } from '../../sales/entities';

@Injectable()
export class PdfService {
  async generateInvoicePdf(sale: Sale): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // --- Header ---
      doc.fontSize(20).text('SISTEMA POS', { align: 'center', underline: true });
      doc.fontSize(10).text('Calle Ficticia 123, Ciudad', { align: 'center' });
      doc.text('Tel: 2222-3333', { align: 'center' });
      doc.text('NIT: 1234567-8', { align: 'center' });
      doc.moveDown();
      doc.text('------------------------------------------------------------', {
        align: 'center',
      });
      doc.moveDown();

      // --- Sale Info ---
      doc.fontSize(12).text(`N° Factura: ${sale.invoiceNumber}`);
      doc.text(`Fecha: ${new Date(sale.date).toLocaleString()}`);

      const customerName = sale.customer ? sale.customer.name : sale.guestCustomer?.name || 'Consumidor Final';
      const customerNit = sale.customer ? sale.customer.nit : sale.guestCustomer?.nit || 'C/F';

      doc.text(`Cliente: ${customerName}`);
      doc.text(`NIT Cliente: ${customerNit}`);
      doc.text(`Sucursal: ${sale.branch?.name || 'N/A'}`);
      doc.moveDown();
      doc.text('------------------------------------------------------------', {
        align: 'center',
      });
      doc.moveDown();

      // --- Table Header ---
      doc.fontSize(10).text('CANT', 50, doc.y, { continued: true });
      doc.text(' PRODUCTO', 100, doc.y, { continued: true });
      doc.text('TOTAL', 450, doc.y);
      doc.moveDown(0.5);

      // --- Table Content ---
      sale.details.forEach((detail) => {
        const startY = doc.y;
        doc.text(Number(detail.quantity).toFixed(3), 50, startY);
        doc.text(detail.product?.name || 'Producto Desconocido', 100, startY, {
          width: 300,
        });
        doc.text(`Q${Number(detail.lineTotal).toFixed(2)}`, 450, startY);
        doc.moveDown();
      });

      doc.moveDown();
      doc.text('------------------------------------------------------------', {
        align: 'center',
      });
      doc.moveDown();

      // --- Totals ---
      const totalX = 350;
      doc.text('Subtotal:', totalX, doc.y, { continued: true });
      doc.text(`Q${Number(sale.subtotal).toFixed(2)}`, 450, doc.y);
      doc.moveDown(0.5);

      doc.text('Impuestos:', totalX, doc.y, { continued: true });
      doc.text(`Q${Number(sale.taxAmount).toFixed(2)}`, 450, doc.y, {
        underline: true,
      });
      doc.moveDown();

      doc.fontSize(14).text('TOTAL:', totalX, doc.y, { continued: true });
      doc.text(`Q${Number(sale.total).toFixed(2)}`, 450, doc.y);
      doc.moveDown();
      doc.fontSize(10).text('------------------------------------------------------------', {
        align: 'center',
      });
      doc.moveDown();

      // --- Footer ---
      doc.moveDown(2);
      doc.text('¡Gracias por su compra!', { align: 'center' });
      doc.text('Vuelva pronto', { align: 'center' });
      doc.moveDown();
      doc.fontSize(8).text('Sujeto a pagos trimestrales', { align: 'center' });
      doc.text('Documento para validación tributaria', { align: 'center' });

      doc.end();
    });
  }

  async generateQuotationPdf(quotation: Quotation): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Colors
      const primaryColor = '#000000';
      const secondaryColor = '#fce4ec'; // Soft pink accent

      // --- Header ---
      doc.fillColor(primaryColor).fontSize(24).text('COTIZACIÓN', { align: 'center' });
      doc.fontSize(12).text(quotation.correlative, { align: 'center' });
      doc.fontSize(10).text(`Fecha: ${new Date(quotation.createdAt).toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      // --- Customer Info ---
      const startX = 50;
      doc.fontSize(12).text('CLIENTE', startX, doc.y, { underline: true });
      doc.moveDown(0.5);
      
      const customerName = quotation.customer ? quotation.customer.name : quotation.guestCustomer?.name || 'Venta General';
      const customerNit = quotation.customer ? quotation.customer.nit : quotation.guestCustomer?.nit || 'C/F';
      const customerAddress = quotation.customer ? quotation.customer.address : quotation.guestCustomer?.address || 'Ciudad';
      const customerEmail = quotation.customer ? quotation.customer.email : quotation.guestCustomer?.email || 'N/A';
      const customerPhone = quotation.customer ? quotation.customer.phone : quotation.guestCustomer?.phone || 'N/A';

      doc.fontSize(10).text(`Nombre: ${customerName}`);
      doc.text(`Documento: ${customerNit}`);
      doc.text(`Dirección: ${customerAddress}`);
      doc.text(`Correo: ${customerEmail}`);
      doc.text(`Teléfono: ${customerPhone}`);
      doc.moveDown(2);

      // --- Table Header ---
      const tableTop = doc.y;
      doc.rect(startX, tableTop, 500, 20).fill(secondaryColor);
      doc.fillColor(primaryColor).fontSize(10);
      doc.text('PRODUCTO', 60, tableTop + 5, { width: 300 });
      doc.text('CANTIDAD', 250, tableTop + 5, { width: 100, align: 'center' });
      doc.text('PRECIO', 350, tableTop + 5, { width: 100, align: 'center' });
      doc.text('TOTAL', 450, tableTop + 5, { width: 100, align: 'center' });
      doc.moveDown(1.5);

      // --- Table Content ---
      quotation.items.forEach((item) => {
        const itemY = doc.y;
        if (itemY > 700) doc.addPage();
        
        // Use unitPrice after discount (if discount breakdown is hidden)
        // unitPriceInDoc = lineTotal / quantity (pre-tax) or lineTotal as whole.
        // User wants "no mostrar descuentos, solo aplicarse".
        // lineTotal is usually (qty * unitPrice - discount) + tax.
        // If we want to show net price per row:
        const unitPriceAdjusted = (Number(item.lineTotal) - Number(item.taxAmount)) / Number(item.quantity);

        doc.text(item.product?.name || 'Producto', 60, itemY, { width: 200 });
        doc.text(Number(item.quantity).toFixed(0), 250, itemY, { width: 100, align: 'center' });
        doc.text(`Q${unitPriceAdjusted.toFixed(2)}`, 350, itemY, { width: 100, align: 'center' });
        doc.text(`Q${(unitPriceAdjusted * Number(item.quantity)).toFixed(2)}`, 450, itemY, { width: 100, align: 'center' });
        doc.moveDown();
        doc.moveTo(startX, doc.y).lineTo(550, doc.y).strokeColor('#eeeeee').stroke();
        doc.moveDown(0.5);
      });

      doc.moveDown();

      // --- Summary and Totals ---
      const leftColX = 50;
      const rightColX = 350;

      const summaryY = doc.y;
      doc.fontSize(9).text('Esta cotización tiene una validez de 30 días.', leftColX, summaryY, { width: 250 });
      doc.text('Después de este tiempo deberá solicitar una nueva cotización', leftColX, doc.y);
      doc.text('y estará sujeta a variación de precios.', leftColX, doc.y);

      doc.fontSize(10);
      doc.text('Sub Total', rightColX, summaryY);
      doc.text(`Q${Number(quotation.subtotal - quotation.discountAmount).toFixed(2)}`, 450, summaryY, { align: 'right' });
      doc.moveDown(0.5);

      doc.text('IVA', rightColX, doc.y);
      doc.text(`Q${Number(quotation.taxAmount).toFixed(2)}`, 450, doc.y - 12, { align: 'right' });
      doc.moveDown(0.5);

      doc.fontSize(12).fillColor('#000000').rect(rightColX, doc.y - 5, 200, 25).fill(secondaryColor);
      doc.fillColor(primaryColor).text('Total', rightColX + 10, doc.y + 2);
      doc.text(`Q${Number(quotation.total).toFixed(2)}`, 450, doc.y - 12, { align: 'right' });

      // --- Footer / Banking ---
      doc.moveDown(4);
      doc.fontSize(9).text('Para abonar a esta cotización o pagar al valor total de la misma.', { align: 'center' });
      doc.text('Realice su pago a la cuenta #1234567 a nombre de Mi Empresa S.A.', { align: 'center' });
      doc.moveDown();
      doc.text('Dirección: Calle 1, Ciudad | Tel: 2222-3333 | Email: ventas@empresa.com', { align: 'center' });

      doc.end();
    });
  }
}
