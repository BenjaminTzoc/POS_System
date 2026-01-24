import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Sale } from '../../sales/entities';

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
      doc
        .fontSize(20)
        .text('SISTEMA POS', { align: 'center', underline: true });
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

      const customerName = sale.customer
        ? sale.customer.name
        : sale.guestCustomer?.name || 'Consumidor Final';
      const customerNit = sale.customer
        ? sale.customer.nit
        : sale.guestCustomer?.nit || 'C/F';

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
      doc
        .fontSize(10)
        .text('------------------------------------------------------------', {
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
}
