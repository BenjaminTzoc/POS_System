import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  namespace: '/sales',
  transports: ['websocket', 'polling'],
})
@Injectable()
export class SaleGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('SaleGateway');

  afterInit(server: Server) {
    this.logger.log('Sale WebSocket Gateway inicializado');

    server.on('connection', (socket) => {
      this.logger.log(`Cliente conectado: ${socket.id}`);

      socket.on('disconnect', () => {
        this.logger.log(`Cliente desconectado: ${socket.id}`);
      });
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);

    client.join('sale-orders');
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  notifyNewSale(sale: any) {
    this.logger.log(`Notificando nueva orden: ${sale.invoiceNumber}`);

    this.server.to('sale-orders').emit('newSaleCreated', {
      type: 'NEW_SALE_CREATED',
      data: {
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        createdBy: sale.createdBy,
      },
    });
  }

  broadcastNextInvoiceNumber(nextNumber: string) {
    this.logger.log(`Broadcast nuevo número: ${nextNumber}`);

    this.server.to('sale-orders').emit('nextInvoiceNumberUpdated', {
      type: 'NEXT_INVOICE_NUMBER_UPDATED',
      data: { nextInvoiceNumber: nextNumber },
    });
  }
}
