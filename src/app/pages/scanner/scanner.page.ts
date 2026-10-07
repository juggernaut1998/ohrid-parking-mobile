import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import { ParkingService, ParkingSession } from '../../services/parking.service';

@Component({
  selector: 'app-scanner',
  templateUrl: './scanner.page.html',
  styleUrls: ['./scanner.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class ScannerPage implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  codeReader: BrowserMultiFormatReader | null = null;
  isScanning = false;
  hasCameraPermission = false;

  // View states
  viewState: 'scanner' | 'active-session' | 'session-ended' = 'scanner';

  // Data
  activeSession: ParkingSession | null = null;
  paymentAmount: number = 0;

  // Timer
  elapsedTime: string = '00:00:00';
  private timerInterval: any;

  // Error state
  errorMessage: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private parkingService: ParkingService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.checkQueryParams();
  }

  ngOnDestroy() {
    this.stopScanning();
    this.clearTimer();
  }

  checkQueryParams() {
    this.route.queryParams.subscribe(params => {
      if (params['action'] === 'view' && params['sessionId']) {
        this.loadActiveSession();
      } else if (params['qrCode'] && params['action'] === 'start') {
        this.loadSpotByQrCode(params['qrCode']);
      } else {
        this.checkForActiveSession();
      }
    });
  }

  async checkForActiveSession() {
    this.parkingService.getActiveSession().subscribe({
      next: (session) => {
        if (session) {
          this.activeSession = session;
          this.viewState = 'active-session';
          this.startTimer();
        } else {
          this.viewState = 'scanner';
        }
      },
      error: () => {
        this.viewState = 'scanner';
      }
    });
  }

  loadActiveSession() {
    const loading = this.loadingCtrl.create({
      message: 'Loading session...',
    });

    loading.then(l => l.present());

    this.parkingService.getActiveSession().subscribe({
      next: (session) => {
        loading.then(l => l.dismiss());
        if (session) {
          this.activeSession = session;
          if (session.status === 'active') {
            this.viewState = 'active-session';
            this.startTimer();
          } else {
            this.viewState = 'session-ended';
          }
        } else {
          this.viewState = 'scanner';
          this.activeSession = null;
        }
      },
      error: (err: any) => {
        loading.then(l => l.dismiss());
        this.showToast('Failed to load session', 'danger');
        this.viewState = 'scanner';
      }
    });
  }

  loadSpotByQrCode(qrCodeOrUrl: string) {
    const loading = this.loadingCtrl.create({
      message: 'Loading parking spot...',
    });

    loading.then(l => l.present());

    this.parkingService.getSpotByQrCode(qrCodeOrUrl).subscribe({
      next: (spot) => {
        loading.then(l => l.dismiss());
        this.router.navigate(['/spot-details'], { state: { spot, fromScan: true }, replaceUrl: true });
      },
      error: (err: any) => {
        loading.then(l => l.dismiss());
        this.showToast('Failed to load parking spot', 'danger');
      }
    });
  }

  async startScanning() {
    this.isScanning = true;
    this.errorMessage = null;

    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

      this.codeReader = new BrowserMultiFormatReader(hints);

      // Get video input devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputDevices = devices.filter((device: MediaDeviceInfo) => device.kind === 'videoinput');

      if (videoInputDevices.length === 0) {
        throw new Error('No camera found');
      }

      // Prefer back camera
      const backCamera = videoInputDevices.find((device: MediaDeviceInfo) =>
        device.label.toLowerCase().includes('back') ||
        device.label.toLowerCase().includes('rear') ||
        device.label.toLowerCase().includes('environment')
      );

      const selectedDevice = backCamera || videoInputDevices[0];

      this.codeReader.decodeFromVideoDevice(
        selectedDevice.deviceId,
        this.videoElement.nativeElement,
        (result, error) => {
          if (result) {
            this.handleScanResult(result.getText());
          }
        }
      );

      this.hasCameraPermission = true;
    } catch (error: any) {
      console.error('Scanner error:', error);
      this.isScanning = false;

      if (error.name === 'NotAllowedError') {
        this.errorMessage = 'Camera permission denied. Please enable camera access in your settings.';
        this.showToast('Camera permission denied', 'danger');
      } else if (error.name === 'NotFoundError') {
        this.errorMessage = 'No camera found on this device.';
        this.showToast('No camera found', 'danger');
      } else {
        this.errorMessage = 'Failed to start camera. Please try again.';
        this.showToast('Failed to start camera', 'danger');
      }
    }
  }

  stopScanning() {
    if (this.codeReader) {
      this.codeReader.reset();
      this.codeReader = null;
    }
    this.isScanning = false;
  }

  async handleScanResult(rawQrValue: string) {
    this.stopScanning();

    const loading = await this.loadingCtrl.create({
      message: 'Processing QR code...',
    });
    await loading.present();

    // Check if this is a stop parking QR (same spot)
    if (this.activeSession) {
      // If we have an active session, scanning stops it
      await loading.dismiss();
      await this.handleStopParking(rawQrValue);
      return;
    }

    // Otherwise it's a start parking QR - fetch spot and navigate to spot details (service extracts code from URL)
    this.parkingService.getSpotByQrCode(rawQrValue).subscribe({
      next: async (spot) => {
        await loading.dismiss();
        this.router.navigate(['/spot-details'], { state: { spot, fromScan: true }, replaceUrl: true });
      },
      error: async (err: any) => {
        await loading.dismiss();
        console.error('Failed to get spot by QR:', err);
        this.showToast('Invalid QR code or parking spot not found', 'danger');
      }
    });
  }

  async handleStopParking(qrCode?: string) {
    const sessionId = this.activeSession?.id;

    const loading = await this.loadingCtrl.create({
      message: 'Stopping parking session...',
    });
    await loading.present();

    this.parkingService.stopParking(sessionId, qrCode).subscribe({
      next: async (result) => {
        await loading.dismiss();
        this.activeSession = result.session;
        this.paymentAmount = result.paymentRequired.amount;
        this.clearTimer();
        this.viewState = 'session-ended';
        this.showToast('Parking stopped. Proceed to payment.', 'success');
      },
      error: async (err: any) => {
        await loading.dismiss();
        console.error('Failed to stop parking:', err);
        this.showToast(err.error?.message || 'Failed to stop parking', 'danger');
      }
    });
  }

  scanToStop() {
    this.viewState = 'scanner';
    setTimeout(() => this.startScanning(), 300);
  }

  goToPayment() {
    if (this.activeSession) {
      this.router.navigate(['/payment'], {
        queryParams: {
          sessionId: this.activeSession.id,
          amount: this.paymentAmount
        }
      });
    }
  }

  private startTimer() {
    if (!this.activeSession) return;

    this.updateElapsedTime();
    this.timerInterval = setInterval(() => {
      this.updateElapsedTime();
    }, 1000);
  }

  private updateElapsedTime() {
    if (!this.activeSession) return;

    const start = new Date(this.activeSession.startedAt);
    const now = new Date();
    const diff = now.getTime() - start.getTime();

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    this.elapsedTime = `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)}`;
  }

  private pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  private clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  goToMap() {
    this.router.navigate(['/tabs/map']);
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
