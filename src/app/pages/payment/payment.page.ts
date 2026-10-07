import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { ParkingService, ParkingSession } from '../../services/parking.service';

interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  type: 'card' | 'wallet' | 'cash';
}

@Component({
  selector: 'app-payment',
  templateUrl: './payment.page.html',
  styleUrls: ['./payment.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class PaymentPage implements OnInit {
  session: ParkingSession | null = null;
  sessionId: string = '';
  paymentId: string = '';
  amount: number = 0;
  selectedPaymentMethod: string = '';
  isProcessing = false;
  paymentComplete = false;
  transactionId = '';
  loadError: string | null = null;

  paymentMethods: PaymentMethod[] = [
    { id: 'card', name: 'Credit/Debit Card', icon: 'card', type: 'card' },
    { id: 'cash', name: 'Cash', icon: 'cash', type: 'cash' }
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private parkingService: ParkingService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.amount = parseFloat(params['amount']) || 0;
      this.paymentId = params['paymentId'] || '';
      this.sessionId = params['sessionId'] || '';

      if (params['sessionId']) {
        this.loadSessionFromHistory();
      } else if (params['paymentId'] && this.amount > 0) {
        this.createMinimalSession();
      } else {
        this.loadError = 'No session or payment ID provided';
      }
    });
  }

  private createMinimalSession() {
    this.session = {
      id: this.paymentId,
      startedAt: new Date(),
      status: 'completed',
      durationMinutes: 0,
      formattedDuration: '',
      pricePerHour: 0,
      currentAmount: this.amount,
      totalAmount: this.amount,
      spot: { id: '', spotNumber: '', address: '', zoneName: 'Parking' },
      vehicle: { id: '', licensePlate: '', displayName: '' }
    };
  }

  async loadSessionFromHistory() {
    const loading = await this.loadingCtrl.create({
      message: 'Loading session...',
    });
    await loading.present();

    this.parkingService.getParkingHistory().subscribe({
      next: async (result) => {
        await loading.dismiss();
        const session = result.sessions.find(s => s.id === this.sessionId);
        if (session) {
          this.session = session;
          if (!this.amount && session.totalAmount) {
            this.amount = session.totalAmount;
          }
          // Get payment ID from session if available
          if (session.payment?.id) {
            this.paymentId = session.payment.id;
          }
        } else {
          this.createMinimalSession();
        }
      },
      error: async (err: any) => {
        await loading.dismiss();
        console.error('Failed to load session:', err);
        if (this.amount > 0) {
          this.createMinimalSession();
        } else {
          this.loadError = 'Failed to load parking session';
          this.showToast('Failed to load session', 'danger');
        }
      }
    });
  }

  selectPaymentMethod(methodId: string) {
    this.selectedPaymentMethod = methodId;
  }

  async processPayment() {
    if (!this.selectedPaymentMethod) return;
    if (!this.sessionId && !this.paymentId) return;

    this.isProcessing = true;

    const loading = await this.loadingCtrl.create({
      message: 'Processing payment...',
    });
    await loading.present();

    if (this.sessionId) {
      this.payViaSession(loading);
    } else if (this.paymentId) {
      this.payViaPaymentId(loading);
    }
  }

  private payViaSession(loading: HTMLIonLoadingElement) {
    this.parkingService.payForSession(this.sessionId, this.selectedPaymentMethod).subscribe({
      next: async (result) => {
        await loading.dismiss();
        this.isProcessing = false;
        this.handlePaymentResult(result);
      },
      error: async (err: any) => {
        await loading.dismiss();
        this.isProcessing = false;
        console.error('Payment failed:', err);
        this.showToast(err.error?.message || 'Payment failed. Please try again.', 'danger');
      }
    });
  }

  private payViaPaymentId(loading: HTMLIonLoadingElement) {
    this.parkingService.processPayment(this.paymentId, this.selectedPaymentMethod).subscribe({
      next: async (result) => {
        await loading.dismiss();
        this.isProcessing = false;
        this.handlePaymentResult(result);
      },
      error: async (err: any) => {
        await loading.dismiss();
        this.isProcessing = false;
        console.error('Payment failed:', err);
        this.showToast(err.error?.message || 'Payment failed. Please try again.', 'danger');
      }
    });
  }

  private handlePaymentResult(result: any) {
    if (result.success) {
      this.transactionId = result.transactionId || '';
      this.paymentComplete = true;
      this.showToast('Payment successful!', 'success');
    } else {
      this.showToast(result.message || 'Payment failed', 'danger');
    }
  }

  goToMap() {
    this.router.navigate(['/tabs/map']);
  }

  goToHistory() {
    this.router.navigate(['/tabs/profile'], { queryParams: { tab: 'history' } });
  }

  goBack() {
    this.router.navigate(['/tabs/map']);
  }

  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
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
