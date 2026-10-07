import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { SocketService, SpotOccupancyUpdate } from './socket.service';

export interface ParkingSpot {
  id: string;
  spotNumber: string;
  qrCode: string;
  latitude: number;
  longitude: number;
  address?: string;
  status: 'free' | 'occupied' | 'reserved' | 'disabled';
  type: string;
  zone: {
    id: string;
    name: string;
    code: string;
    color: string;
    pricePerHour: number;
  };
}

export interface ParkingSession {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'active' | 'completed' | 'cancelled';
  durationMinutes: number;
  formattedDuration: string;
  pricePerHour: number;
  currentAmount: number;
  totalAmount?: number;
  spot: {
    id: string;
    spotNumber: string;
    address: string;
    zoneName: string;
  };
  vehicle: {
    id: string;
    licensePlate: string;
    displayName: string;
  };
  payment?: {
    id: string;
    status: string;
    amount: number;
    paidAt?: string;
  };
}

export interface StartParkingDto {
  qrCode: string;
  vehicleId?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  message: string;
}

export interface ParkingBounds {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

interface SpotsResponse {
  spots: any[];
  bounds: ParkingBounds;
}

@Injectable({
  providedIn: 'root'
})
export class ParkingService {
  private parkingSpotsSubject = new BehaviorSubject<ParkingSpot[]>([]);
  public parkingSpots$ = this.parkingSpotsSubject.asObservable();

  private activeSessionSubject = new BehaviorSubject<ParkingSession | null>(null);
  public activeSession$ = this.activeSessionSubject.asObservable();

  constructor(
    private api: ApiService,
    private socketService: SocketService
  ) {
    // Subscribe to real-time occupancy updates
    this.socketService.spotOccupancy$.subscribe(update => {
      this.handleOccupancyUpdate(update);
    });
  }

  // Handle real-time occupancy updates from WebSocket
  private handleOccupancyUpdate(update: SpotOccupancyUpdate): void {
    const currentSpots = this.parkingSpotsSubject.value;
    const updatedSpots = currentSpots.map(spot => {
      if (spot.id === update.spotId) {
        return {
          ...spot,
          status: update.status as ParkingSpot['status']
        };
      }
      return spot;
    });
    this.parkingSpotsSubject.next(updatedSpots);
  }

  // Transform backend response to frontend model
  private transformSpot(spot: any): ParkingSpot {
    return {
      id: spot.id?.toString(),
      spotNumber: spot.spot_number || spot.spotNumber || '',
      qrCode: spot.qr_code || spot.qrCode || '',
      latitude: parseFloat(spot.latitude) || 0,
      longitude: parseFloat(spot.longitude) || 0,
      address: spot.address,
      status: spot.status || 'free',
      type: spot.type || 'regular',
      zone: {
        id: spot.zone?.id?.toString() || '',
        name: spot.zone?.name || '',
        code: spot.zone?.code || '',
        color: spot.zone?.color || '#3880ff',
        pricePerHour: parseFloat(spot.zone?.price_per_hour) || 0
      }
    };
  }

  private transformSession(session: any): ParkingSession {
    return {
      id: session.id?.toString(),
      startedAt: new Date(session.started_at || session.startedAt),
      endedAt: session.ended_at ? new Date(session.ended_at) : undefined,
      status: session.status || 'active',
      durationMinutes: session.duration_minutes || session.durationMinutes || 0,
      formattedDuration: session.formatted_duration || session.formattedDuration || '0m',
      pricePerHour: parseFloat(session.price_per_hour) || 0,
      currentAmount: parseFloat(session.current_amount) || 0,
      totalAmount: session.total_amount ? parseFloat(session.total_amount) : undefined,
      spot: {
        id: session.spot?.id?.toString() || '',
        spotNumber: session.spot?.spot_number || '',
        address: session.spot?.address || '',
        zoneName: session.spot?.zone_name || session.spot?.zone?.name || ''
      },
      vehicle: {
        id: session.vehicle?.id?.toString() || '',
        licensePlate: session.vehicle?.license_plate || '',
        displayName: session.vehicle?.display_name || ''
      },
      payment: session.payment ? {
        id: session.payment.id?.toString(),
        status: session.payment.status,
        amount: parseFloat(session.payment.amount),
        paidAt: session.payment.paid_at
      } : undefined
    };
  }

  // Get parking spots (with optional filters)
  // Backend: GET /parking/spots
  getSpots(params?: { lat?: number; lng?: number; radius?: number; zone_id?: string }): Observable<ParkingSpot[]> {
    let url = '/parking/spots';
    if (params) {
      const queryParams = new URLSearchParams();
      if (params.lat) queryParams.set('latitude', params.lat.toString());
      if (params.lng) queryParams.set('longitude', params.lng.toString());
      if (params.radius) queryParams.set('radius', params.radius.toString());
      if (params.zone_id) queryParams.set('zone_id', params.zone_id);
      if (queryParams.toString()) {
        url += '?' + queryParams.toString();
      }
    }

    return this.api.get<any>(url).pipe(
      map(response => {
        // Handle various response formats
        let spotsArray: any[] = [];

        if (Array.isArray(response)) {
          // Response is directly an array
          spotsArray = response;
        } else if (response?.spots && Array.isArray(response.spots)) {
          // Response is { spots: [...], bounds: {...} }
          spotsArray = response.spots;
        } else if (response?.data && Array.isArray(response.data)) {
          // Response is { data: [...] }
          spotsArray = response.data;
        } else {
          console.warn('Unexpected spots response format:', response);
          spotsArray = [];
        }

        return spotsArray.map(s => this.transformSpot(s));
      }),
      tap(spots => {
        console.log('Transformed spots:', spots.length);
        this.parkingSpotsSubject.next(spots);
        // Connect to real-time updates after loading spots
        this.socketService.connect();
      })
    );
  }

  // Alias for backward compatibility
  getNearbySpots(lat: number, lng: number, radius: number = 100): Observable<ParkingSpot[]> {
    return this.getSpots({ lat, lng, radius });
  }

  // Extract spot code from QR content (e.g. "http://localhost/api/parking/spots/OHRID-S5O5HY6D" -> "OHRID-S5O5HY6D")
  private extractSpotCode(rawValue: string): string {
    const match = rawValue.trim().match(/\/spots\/([^/?]+)/);
    return match ? match[1] : rawValue.trim();
  }

  // Get spot details by QR code
  // Backend: GET /parking/spots/{qr_code}
  getSpotByQrCode(qrCodeOrUrl: string): Observable<ParkingSpot> {
    const qrCode = this.extractSpotCode(qrCodeOrUrl);
    return this.api.get<{ spot: any }>(`/parking/spots/${qrCode}`).pipe(
      map(response => this.transformSpot(response.spot || response))
    );
  }

  // Start parking session
  // Backend: POST /parking/start
  startParking(data: StartParkingDto): Observable<ParkingSession> {
    return this.api.post<{ session: any; message: string }>('/parking/start', {
      qr_code: data.qrCode,
      vehicle_id: data.vehicleId
    }).pipe(
      map(response => this.transformSession(response.session || response)),
      tap(session => this.activeSessionSubject.next(session))
    );
  }

  // Stop parking session
  // Backend: POST /parking/end
  stopParking(sessionId?: string, qrCodeOrUrl?: string): Observable<{ session: ParkingSession; paymentRequired: { amount: number; currency: string } }> {
    const body: any = {};
    if (sessionId) body.session_id = sessionId;
    if (qrCodeOrUrl) body.qr_code = this.extractSpotCode(qrCodeOrUrl);

    return this.api.post<{ session: any; payment_required: any }>('/parking/end', body).pipe(
      map(response => ({
        session: this.transformSession(response.session),
        paymentRequired: {
          amount: response.payment_required?.amount || 0,
          currency: response.payment_required?.currency || 'MKD'
        }
      })),
      tap(() => this.activeSessionSubject.next(null))
    );
  }

  // Get active session
  // Backend: GET /parking/active
  getActiveSession(): Observable<ParkingSession | null> {
    return this.api.get<{ session: any | null }>('/parking/active').pipe(
      map(response => response.session ? this.transformSession(response.session) : null),
      tap(session => this.activeSessionSubject.next(session))
    );
  }

  // Get parking history (with optional pagination)
  // Backend: GET /parking/history?page=1
  getParkingHistory(page = 1): Observable<{ sessions: ParkingSession[]; pagination: any }> {
    const params = page > 1 ? `?page=${page}` : '';
    return this.api.get<{ sessions: any[]; pagination: any }>(`/parking/history${params}`).pipe(
      map(response => ({
        sessions: (response.sessions || []).map(s => this.transformSession(s)),
        pagination: response.pagination || {}
      }))
    );
  }

  // Process payment by payment ID
  // Backend: POST /payments/{payment}/pay
  processPayment(paymentId: string, paymentMethod: string): Observable<PaymentResult> {
    return this.api.post<any>(`/payments/${paymentId}/pay`, {
      payment_method: paymentMethod
    }).pipe(
      map(result => ({
        success: result.success || result.status === 'paid',
        transactionId: result.transaction_id || result.transactionId,
        message: result.message || 'Payment processed'
      }))
    );
  }

  // Process payment for a session directly
  // Backend: POST /sessions/{session}/pay
  payForSession(sessionId: string, paymentMethod: string): Observable<PaymentResult> {
    return this.api.post<any>(`/sessions/${sessionId}/pay`, {
      payment_method: paymentMethod
    }).pipe(
      map(result => ({
        success: result.success || result.status === 'paid',
        transactionId: result.transaction_id || result.transactionId,
        message: result.message || 'Payment processed'
      }))
    );
  }

  // Get current spots from BehaviorSubject (for synchronous access)
  getCurrentSpots(): ParkingSpot[] {
    return this.parkingSpotsSubject.value;
  }
}
