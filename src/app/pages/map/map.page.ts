import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { LocationService, Coordinates } from '../../services/location.service';
import { ParkingService, ParkingSpot, ParkingSession } from '../../services/parking.service';
import { SocketService } from '../../services/socket.service';
import { environment } from '../../../environments/environment';

declare var google: any;

@Component({
  selector: 'app-map',
  templateUrl: './map.page.html',
  styleUrls: ['./map.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class MapPage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('mapContainer') mapContainer!: ElementRef;

  map: any;
  markers: Map<string, any> = new Map();
  userMarker: any;
  currentPosition: Coordinates | null = null;
  parkingSpots: ParkingSpot[] = [];
  activeSession: ParkingSession | null = null;
  isLoading = true;
  connectionStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  loadError: string | null = null;

  private locationSub?: Subscription;
  private spotsSub?: Subscription;
  private socketStatusSub?: Subscription;

  // Default to Ohrid, Macedonia
  defaultLocation: Coordinates = {
    latitude: 41.1231,
    longitude: 20.8016
  };

  constructor(
    private locationService: LocationService,
    private parkingService: ParkingService,
    private socketService: SocketService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.checkActiveSession();
    this.setupSocketConnection();
    this.subscribeToSpotUpdates();
  }

  ngAfterViewInit() {
    this.initMap();
  }

  ngOnDestroy() {
    this.locationSub?.unsubscribe();
    this.spotsSub?.unsubscribe();
    this.socketStatusSub?.unsubscribe();
    this.locationService.stopWatching();
  }

  private setupSocketConnection(): void {
    // Connect to WebSocket for real-time updates
    this.socketService.connect();

    // Monitor connection status
    this.socketStatusSub = this.socketService.connectionStatus$.subscribe(status => {
      this.connectionStatus = status;
      if (status === 'connected') {
        console.log('Socket connected - receiving real-time updates');
      }
    });
  }

  private subscribeToSpotUpdates(): void {
    // Subscribe to parking spots observable for real-time updates
    this.spotsSub = this.parkingService.parkingSpots$.subscribe(spots => {
      if (spots.length > 0) {
        this.parkingSpots = spots;
        this.updateSpotMarkers();
      }
    });
  }

  async initMap() {
    const loading = await this.loadingCtrl.create({
      message: 'Loading map...',
    });
    await loading.present();

    try {
      // Get current position
      const position = await this.locationService.getCurrentPosition();
      this.currentPosition = position || this.defaultLocation;

      // Load Google Maps script if not loaded
      if (typeof google === 'undefined') {
        await this.loadGoogleMapsScript();
      }

      // Initialize map
      this.createMap();

      // Load parking spots from API
      await this.loadParkingSpots();

      this.isLoading = false;
      await loading.dismiss();

      // Start watching position
      this.locationSub = this.locationService.currentPosition$.subscribe(pos => {
        if (pos) {
          this.updateUserPosition(pos);
        }
      });
      this.locationService.startWatching();
    } catch (error) {
      console.error('Error initializing map:', error);
      await loading.dismiss();
      this.isLoading = false;
      this.loadError = 'Failed to load map';
      this.showToast('Failed to load map', 'danger');
    }
  }

  private loadGoogleMapsScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google?.maps?.Map) {
        resolve();
        return;
      }

      const callbackName = 'initGoogleMapsCallback_' + Date.now();
      (window as any)[callbackName] = () => {
        delete (window as any)[callbackName];
        resolve();
      };

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${environment.googleMapsApiKey}&libraries=places&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        delete (window as any)[callbackName];
        reject(new Error('Failed to load Google Maps'));
      };
      document.head.appendChild(script);
    });
  }

  private createMap() {
    if (typeof google === 'undefined' || !google?.maps?.Map) {
      throw new Error('Google Maps API not loaded');
    }
    const mapOptions = {
      center: { 
        lat: this.currentPosition!.latitude, 
        lng: this.currentPosition!.longitude 
      },
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    };

    this.map = new google.maps.Map(this.mapContainer.nativeElement, mapOptions);

    // Add user marker
    this.userMarker = new google.maps.Marker({
      position: { 
        lat: this.currentPosition!.latitude, 
        lng: this.currentPosition!.longitude 
      },
      map: this.map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#3b82f6',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3
      },
      title: 'Your Location'
    });
  }

  async loadParkingSpots() {
    if (!this.currentPosition) return;

    this.loadError = null;

    this.parkingService.getNearbySpots(
      this.currentPosition.latitude,
      this.currentPosition.longitude
    ).subscribe({
      next: (spots) => {
        // Spots will be updated via the BehaviorSubject subscription
        console.log(`Loaded ${spots.length} parking spots`);
      },
      error: (err) => {
        console.error('Error loading spots:', err);
        this.loadError = 'Failed to load parking spots. Please check your connection.';
        this.showToast('Failed to load parking spots', 'danger');
      }
    });
  }

  private updateSpotMarkers() {
    if (!this.map || typeof google === 'undefined') return;

    // Track which spots we've processed
    const processedSpotIds = new Set<string>();

    this.parkingSpots.forEach(spot => {
      processedSpotIds.add(spot.id);

      const existingMarker = this.markers.get(spot.id);
      
      if (existingMarker) {
        // Update existing marker icon (in case status changed)
        existingMarker.setIcon(this.getSpotIcon(spot));
      } else {
        // Create new marker
        const marker = new google.maps.Marker({
          position: { lat: spot.latitude, lng: spot.longitude },
          map: this.map,
          icon: this.getSpotIcon(spot),
          title: this.getSpotTitle(spot)
        });

        marker.addListener('click', () => {
          this.selectSpot(spot);
        });

        this.markers.set(spot.id, marker);
      }
    });

    // Remove markers for spots that no longer exist
    this.markers.forEach((marker, spotId) => {
      if (!processedSpotIds.has(spotId)) {
        marker.setMap(null);
        this.markers.delete(spotId);
      }
    });
  }

  private getSpotTitle(spot: ParkingSpot): string {
    return `${spot.zone.name} - ${spot.spotNumber}`;
  }

  private getSpotIcon(spot: ParkingSpot) {
    // Color based on status
    let color = '#10b981'; // Green - free

    switch (spot.status) {
      case 'occupied':
        color = '#ef4444'; // Red
        break;
      case 'reserved':
        color = '#f97316'; // Orange
        break;
      case 'disabled':
        color = '#6b7280'; // Gray
        break;
      case 'free':
      default:
        color = spot.zone.color || '#10b981'; // Use zone color or green
    }

    return {
      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 1.8,
      anchor: new google.maps.Point(12, 24)
    };
  }

  private updateUserPosition(position: Coordinates) {
    this.currentPosition = position;
    if (this.userMarker) {
      this.userMarker.setPosition({
        lat: position.latitude,
        lng: position.longitude
      });
    }
  }

  selectSpot(spot: ParkingSpot) {
    this.router.navigate(['/spot-details'], { state: { spot } });
  }

  centerOnUser() {
    if (this.currentPosition && this.map) {
      this.map.panTo({
        lat: this.currentPosition.latitude,
        lng: this.currentPosition.longitude
      });
      this.map.setZoom(16);
    }
  }

  async checkActiveSession() {
    this.parkingService.getActiveSession().subscribe({
      next: (session) => {
        this.activeSession = session;
      },
      error: () => {
        this.activeSession = null;
      }
    });
  }

  goToActiveSession() {
    if (this.activeSession) {
      this.router.navigate(['/tabs/scanner'], { 
        queryParams: { sessionId: this.activeSession.id, action: 'view' }
      });
    }
  }

  async refresh(event: any) {
    await this.loadParkingSpots();
    event.target.complete();
  }

  retryLoad() {
    this.loadError = null;
    this.loadParkingSpots();
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
