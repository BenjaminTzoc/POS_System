import { Injectable, Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  namespace: '/purchases',
  transports: ['websocket', 'polling'],
})
@Injectable()
export class PurchaseGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('PurchaseGateway');

  afterInit(server: Server) {
    this.logger.log('Purchase WebSocket Gateway inicializado');

    server.on('connection', (socket) => {
      this.logger.log(`✅ Cliente conectado: ${socket.id}`);

      socket.on('disconnect', () => {
        this.logger.log(`❌ Cliente desconectado: ${socket.id}`);
      });
    });
  }

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
    client.join('purchase-orders');
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  notifyNewPurchase(purchase: any) {
    this.logger.log(`📢 Notificando nueva orden: ${purchase.invoiceNumber}`);

    this.server.to('purchase-orders').emit('newPurchaseCreated', {
      type: 'NEW_PURCHASE_CREATED',
      data: {
        invoiceNumber: purchase.invoiceNumber,
        createdAt: purchase.createdAt,
        createdBy: purchase.createdBy,
      },
    });
  }

  broadcastNextInvoiceNumber(nextNumber: string) {
    this.logger.log(`🔢 Broadcast nuevo número: ${nextNumber}`);

    this.server.to('purchase-orders').emit('nextInvoiceNumberUpdated', {
      type: 'NEXT_INVOICE_NUMBER_UPDATED',
      data: { nextInvoiceNumber: nextNumber },
    });
  }
}
