import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { IonicModule, LoadingController, ToastController, AlertController } from '@ionic/angular';
import { ParkingService, ParkingSpot, ParkingSession } from '../../services/parking.service';
import { UserService, Vehicle } from '../../services/user.service';

@Component({
  selector: 'app-spot-details',
  templateUrl: './spot-details.page.html',
  styleUrls: ['./spot-details.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class SpotDetailsPage implements OnInit {
  spot: ParkingSpot | null = null;
  vehicles: Vehicle[] = [];
  selectedVehicleId = '';
  isLoading = true;
  loadError: string | null = null;
  isStarting = false;
  activeSession: ParkingSession | null = null;
  fromScan = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private parkingService: ParkingService,
    private userService: UserService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) {}

  ngOnInit() {
    this.checkActiveSession();
    
    const navigation = this.router.getCurrentNavigation();
    const navState = navigation?.extras?.state as { spot?: ParkingSpot; fromScan?: boolean } | undefined;
    const stateSpot = navState?.spot;
    this.fromScan = navState?.fromScan ?? false;
    
    if (stateSpot) {
      this.spot = stateSpot;
      this.isLoading = false;
      if (this.fromScan) {
        this.loadVehicles();
      }
    } else {
      const qrCode = this.route.snapshot.queryParamMap.get('qrCode');
      const spotId = this.route.snapshot.queryParamMap.get('spotId');
      
      if (qrCode) {
        this.loadSpotByQrCode(qrCode);
      } else if (spotId) {
        this.loadSpotById(spotId);
      } else {
        this.loadError = 'No spot information provided';
        this.isLoading = false;
      }
    }
  }

  private setDefaultVehicle() {
    const defaultVehicle = this.vehicles.find(v => v.isDefault);
    if (defaultVehicle) {
      this.selectedVehicleId = defaultVehicle.id;
    } else if (this.vehicles.length > 0) {
      this.selectedVehicleId = this.vehicles[0].id;
    }
  }

  goToScanToPark() {
    this.router.navigate(['/tabs/scanner']);
  }

  goToActiveSession() {
    if (this.activeSession) {
      this.router.navigate(['/tabs/scanner'], {
        queryParams: { sessionId: this.activeSession.id, action: 'view' }
      });
    }
  }

  loadVehicles() {
    this.userService.getVehicles().subscribe({
      next: (vehicles) => {
        this.vehicles = vehicles;
        if (this.spot) this.setDefaultVehicle();
      },
      error: (err: any) => {
        console.error('Failed to load vehicles:', err);
      }
    });
  }

  checkActiveSession() {
    this.parkingService.getActiveSession().subscribe({
      next: (session) => {
        this.activeSession = session;
      }
    });
  }

  loadSpotByQrCode(qrCode: string) {
    this.parkingService.getSpotByQrCode(qrCode).subscribe({
      next: (spot) => {
        this.spot = spot;
        this.isLoading = false;
        if (this.fromScan) {
          this.loadVehicles();
          this.setDefaultVehicle();
        }
      },
      error: (err: any) => {
        this.isLoading = false;
        this.loadError = 'Invalid QR code or parking spot not found';
        this.showToast('Could not load parking spot', 'danger');
      }
    });
  }

  loadSpotById(spotId: string) {
    const spots = this.parkingService.getCurrentSpots();
    const spot = spots.find(s => s.id === spotId);
    if (spot) {
      this.spot = spot;
      this.isLoading = false;
      if (this.fromScan) {
        this.loadVehicles();
        this.setDefaultVehicle();
      }
    } else {
      this.loadError = 'Spot not found';
      this.isLoading = false;
    }
  }

  async startParking() {
    if (!this.spot || !this.selectedVehicleId) {
      this.showToast('Please select a vehicle', 'warning');
      return;
    }

    if (this.vehicles.length === 0) {
      const alert = await this.alertCtrl.create({
        header: 'No Vehicles',
        message: 'Please add a vehicle in your profile before parking.',
        cssClass: 'custom-alert',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { 
            text: 'Add Vehicle', 
            handler: () => this.router.navigate(['/tabs/profile'])
          }
        ]
      });
      await alert.present();
      return;
    }

    this.isStarting = true;

    const loading = await this.loadingCtrl.create({
      message: 'Starting parking...',
      cssClass: 'custom-loading'
    });
    await loading.present();

    this.parkingService.startParking({
      qrCode: this.spot.qrCode,
      vehicleId: this.selectedVehicleId
    }).subscribe({
      next: async (session) => {
        await loading.dismiss();
        this.isStarting = false;
        this.showToast('Parking started!', 'success');
        this.router.navigate(['/tabs/scanner'], { 
          queryParams: { sessionId: session.id, action: 'view' },
          replaceUrl: true
        });
      },
      error: async (err: any) => {
        await loading.dismiss();
        this.isStarting = false;
        this.showToast(err.error?.message || 'Failed to start parking', 'danger');
      }
    });
  }

  goBack() {
    this.router.navigate(['/tabs/map']);
  }

  goToProfile() {
    this.router.navigate(['/tabs/profile']);
  }

  getSpotStatus(spot: ParkingSpot): string {
    switch (spot.status) {
      case 'free': return 'Available';
      case 'occupied': return 'Occupied';
      case 'reserved': return 'Reserved';
      case 'disabled': return 'Disabled';
      default: return spot.status;
    }
  }

  isSpotAvailable(spot: ParkingSpot): boolean {
    return spot.status === 'free';
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
