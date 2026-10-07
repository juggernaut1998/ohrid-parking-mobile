import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { StorageService } from './storage.service';

export interface SpotOccupancyUpdate {
  spotId: string;
  status: 'free' | 'occupied' | 'reserved' | 'disabled';
  availableSpots?: number;
  totalSpots?: number;
}

export interface ParkingSessionEvent {
  type: 'session_started' | 'session_ended' | 'payment_completed';
  sessionId: string;
  spotId: string;
  userId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService implements OnDestroy {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 5000;
  private reconnectTimer: any;
  private pingInterval: any;
  private socketId: string | null = null;
  private isEnabled = true;

  private connectionStatus = new BehaviorSubject<'connected' | 'disconnected' | 'connecting'>('disconnected');
  public connectionStatus$ = this.connectionStatus.asObservable();

  private spotOccupancySubject = new Subject<SpotOccupancyUpdate>();
  public spotOccupancy$ = this.spotOccupancySubject.asObservable();

  private sessionEventSubject = new Subject<ParkingSessionEvent>();
  public sessionEvent$ = this.sessionEventSubject.asObservable();

  constructor(private storage: StorageService) {
    // Disable WebSocket if wsUrl is not configured
    if (!environment.wsUrl || environment.wsUrl === 'ws://localhost:8080') {
      console.log('WebSocket URL not configured or using default - WebSocket disabled');
      // Still enable for development
      this.isEnabled = true;
    }
  }

  connect(): void {
    if (!this.isEnabled) {
      console.log('WebSocket is disabled');
      return;
    }

    if (this.socket?.readyState === WebSocket.OPEN ||
        this.socket?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.connectionStatus.next('connecting');

    // Laravel Reverb uses Pusher protocol
    const wsUrl = environment.wsUrl || 'ws://localhost:8080';
    const appKey = environment.pusherAppKey || 'ohrid-parking-key';

    // Build Pusher-compatible WebSocket URL
    const url = `${wsUrl}/app/${appKey}?protocol=7&client=js&version=8.3.0&flash=false`;

    console.log('Connecting to WebSocket:', url);

    try {
      this.socket = new WebSocket(url);

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.socket?.readyState === WebSocket.CONNECTING) {
          console.log('WebSocket connection timeout');
          this.socket.close();
          this.connectionStatus.next('disconnected');
        }
      }, 10000);

      this.socket.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket connected');
        this.connectionStatus.next('connected');
        this.reconnectAttempts = 0;

        // Start ping interval to keep connection alive
        this.startPingInterval();
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket closed:', event.code, event.reason);
        this.connectionStatus.next('disconnected');
        this.stopPingInterval();

        // Only attempt reconnect if not a normal close
        if (event.code !== 1000) {
          this.attemptReconnect();
        }
      };

      this.socket.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.warn('WebSocket error - Reverb may not be running:', error);
        this.connectionStatus.next('disconnected');
      };
    } catch (error) {
      console.warn('Failed to create WebSocket - Reverb may not be running:', error);
      this.connectionStatus.next('disconnected');
      // Don't attempt reconnect on initial connection failure
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopPingInterval();

    if (this.socket) {
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.connectionStatus.next('disconnected');
  }

  private startPingInterval(): void {
    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.sendPusherEvent('pusher:ping', {});
      }
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached - WebSocket disabled');
      this.isEnabled = false;
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay / 1000}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      console.log('WebSocket message:', message.event);

      // Handle Pusher protocol events
      switch (message.event) {
        case 'pusher:connection_established':
          const connectionData = JSON.parse(message.data || '{}');
          this.socketId = connectionData.socket_id;
          console.log('Pusher connection established, socket ID:', this.socketId);
          // Subscribe to channel where backend broadcasts spot.updated
          this.subscribeToChannel('parking-spots');
          break;

        case 'pusher:pong':
          // Pong received, connection is alive
          break;

        case 'pusher_internal:subscription_succeeded':
          console.log('Successfully subscribed to channel:', message.channel);
          break;

        case 'pusher:error':
          console.error('Pusher error:', message.data);
          break;

        case 'spot.updated':
        case 'SpotUpdated':
        case 'App\\Events\\SpotUpdated':
          this.handleSpotUpdate(message);
          break;

        case 'session.started':
        case 'SessionStarted':
        case 'App\\Events\\SessionStarted':
          this.handleSessionEvent('session_started', message);
          break;

        case 'session.ended':
        case 'SessionEnded':
        case 'App\\Events\\SessionEnded':
          this.handleSessionEvent('session_ended', message);
          break;

        case 'payment.completed':
        case 'PaymentCompleted':
        case 'App\\Events\\PaymentCompleted':
          this.handleSessionEvent('payment_completed', message);
          break;

        default:
          // Handle other events
          if (message.event && !message.event.startsWith('pusher')) {
            console.log('Received event:', message.event);
          }
      }
    } catch (error) {
      console.error('Failed to parse socket message:', error);
    }
  }

  private handleSpotUpdate(message: any): void {
    try {
      const data = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
      this.spotOccupancySubject.next({
        spotId: data.spot_id?.toString() || data.spotId?.toString() || data.id?.toString(),
        status: data.status,
        availableSpots: data.available_spots,
        totalSpots: data.total_spots
      });
    } catch (e) {
      console.error('Error handling spot update:', e);
    }
  }

  private handleSessionEvent(type: ParkingSessionEvent['type'], message: any): void {
    try {
      const data = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
      this.sessionEventSubject.next({
        type,
        sessionId: data.session_id?.toString() || data.sessionId?.toString(),
        spotId: data.spot_id?.toString() || data.spotId?.toString(),
        userId: data.user_id?.toString() || data.userId?.toString()
      });
    } catch (e) {
      console.error('Error handling session event:', e);
    }
  }

  private sendPusherEvent(event: string, data: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, data }));
    }
  }

  // Subscribe to a public channel
  subscribeToChannel(channelName: string): void {
    console.log('Subscribing to channel:', channelName);
    this.sendPusherEvent('pusher:subscribe', {
      channel: channelName
    });
  }



  ngOnDestroy(): void {
    this.disconnect();
  }
}
