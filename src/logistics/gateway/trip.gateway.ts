import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export type TripRealtimeType =
  | 'SALE_DELIVERED'
  | 'TRANSFER_RECEIVED'
  | 'TRIP_STATUS_CHANGED';

export interface TripRealtimePayload {
  type: TripRealtimeType;
  tripId: string;
  itemId?: string;
  itemStatus?: string;
  tripStatus?: string;
  outcome?: string;
  transferStatus?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  namespace: '/trips',
  transports: ['websocket', 'polling'],
})
@Injectable()
export class TripGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TripGateway.name);

  afterInit() {
    this.logger.log('Trip WebSocket Gateway inicializado');
  }

  handleConnection(client: Socket) {
    client.join('trips');
    this.logger.log(`Cliente conectado a /trips: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado de /trips: ${client.id}`);
  }

  @SubscribeMessage('joinTrip')
  handleJoinTrip(@ConnectedSocket() client: Socket, @MessageBody() tripId: string) {
    if (!tripId || typeof tripId !== 'string') return;
    client.join(`trip:${tripId}`);
  }

  @SubscribeMessage('leaveTrip')
  handleLeaveTrip(@ConnectedSocket() client: Socket, @MessageBody() tripId: string) {
    if (!tripId || typeof tripId !== 'string') return;
    client.leave(`trip:${tripId}`);
  }

  notifyTripUpdated(payload: TripRealtimePayload) {
    this.logger.log(`Trip event ${payload.type} trip=${payload.tripId} item=${payload.itemId ?? '-'}`);
    this.server.to('trips').emit('tripUpdated', payload);
    this.server.to(`trip:${payload.tripId}`).emit('tripUpdated', payload);
  }
}
