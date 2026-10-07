import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { IonicModule, LoadingController, ToastController, AlertController, ViewWillEnter } from '@ionic/angular';
import { AuthService, User } from '../../services/auth.service';
import { UserService, Vehicle, UpdateProfileDto } from '../../services/user.service';
import { ParkingService, ParkingSession } from '../../services/parking.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule]
})
export class ProfilePage implements OnInit, ViewWillEnter {
  user: User | null = null;
  vehicles: Vehicle[] = [];
  parkingHistory: ParkingSession[] = [];
  
  activeTab: 'profile' | 'vehicles' | 'history' = 'profile';
  isEditingProfile = false;
  profileForm: FormGroup;
  historyPage = 1;
  hasMoreHistory = true;
  
  // Loading states
  vehiclesLoading = false;
  historyLoading = false;
  
  // Error states
  vehiclesError: string | null = null;
  historyError: string | null = null;
  
  // Add vehicle modal
  showAddVehicle = false;
  vehicleForm: FormGroup;
  editingVehicleId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private userService: UserService,
    private parkingService: ParkingService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController
  ) {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required]]
    });

    this.vehicleForm = this.fb.group({
      licensePlate: ['', [Validators.required, Validators.minLength(4)]],
      brand: ['', Validators.required],
      model: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.loadUserData();
    this.loadVehicles();
    this.loadParkingHistory();
    this.route.queryParams.subscribe(params => {
      if (params['tab'] === 'history') {
        this.activeTab = 'history';
        this.loadParkingHistory();
      }
    });
  }

  ionViewWillEnter() {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'history') {
      this.activeTab = 'history';
      this.loadParkingHistory();
    }
  }

  loadUserData() {
    this.authService.currentUser$.subscribe(user => {
      this.user = user;
      if (user) {
        this.profileForm.patchValue({
          name: user.name || '',
          phone: user.phone || ''
        });
      }
    });
  }

  loadVehicles() {
    this.vehiclesLoading = true;
    this.vehiclesError = null;

    this.userService.getVehicles().subscribe({
      next: (vehicles) => {
        this.vehicles = vehicles;
        this.vehiclesLoading = false;
      },
      error: (err) => {
        console.error('Failed to load vehicles:', err);
        this.vehiclesError = 'Failed to load vehicles';
        this.vehiclesLoading = false;
      }
    });
  }

  loadParkingHistory(append = false) {
    if (!append) {
      this.historyPage = 1;
      this.hasMoreHistory = true;
      this.parkingHistory = [];
    }
    this.historyLoading = true;
    this.historyError = null;

    this.parkingService.getParkingHistory(this.historyPage).subscribe({
      next: (result) => {
        this.parkingHistory = append ? [...this.parkingHistory, ...result.sessions] : result.sessions;
        const pagination = result.pagination;
        this.hasMoreHistory = pagination?.current_page < pagination?.last_page;
        if (pagination?.current_page) {
          this.historyPage = pagination.current_page;
        }
        this.historyLoading = false;
      },
      error: (err: any) => {
        console.error('Failed to load history:', err);
        this.historyError = 'Failed to load parking history';
        this.historyLoading = false;
      }
    });
  }

  refreshHistory(event: any) {
    this.historyPage = 1;
    this.hasMoreHistory = true;
    this.historyError = null;
    this.parkingService.getParkingHistory(1).subscribe({
      next: (result) => {
        this.parkingHistory = result.sessions;
        const pagination = result.pagination;
        this.hasMoreHistory = pagination?.current_page < pagination?.last_page;
        this.historyPage = 1;
        event?.target?.complete();
      },
      error: (err: any) => {
        this.historyError = 'Failed to load parking history';
        event?.target?.complete();
      }
    });
  }

  loadMoreHistory(event: any) {
    const nextPage = this.historyPage + 1;
    this.parkingService.getParkingHistory(nextPage).subscribe({
      next: (result) => {
        this.parkingHistory = [...this.parkingHistory, ...result.sessions];
        const pagination = result.pagination;
        this.hasMoreHistory = pagination ? pagination.current_page < pagination.last_page : false;
        this.historyPage = pagination?.current_page ?? nextPage;
        event?.target?.complete();
      },
      error: () => {
        event?.target?.complete();
      }
    });
  }

  setActiveTab(tab: 'profile' | 'vehicles' | 'history') {
    this.activeTab = tab;
  }

  startEditProfile() {
    this.isEditingProfile = true;
  }

  cancelEditProfile() {
    this.isEditingProfile = false;
    if (this.user) {
      this.profileForm.patchValue({
        name: this.user.name || '',
        phone: this.user.phone || ''
      });
    }
  }

  async saveProfile() {
    if (this.profileForm.invalid) return;

    const loading = await this.loadingCtrl.create({
      message: 'Saving...',
    });
    await loading.present();

    this.userService.updateProfile(this.profileForm.value).subscribe({
      next: async () => {
        await loading.dismiss();
        this.isEditingProfile = false;
        this.authService.refreshUser().subscribe();
        this.showToast('Profile updated!', 'success');
      },
      error: async (err) => {
        await loading.dismiss();
        this.showToast(err.error?.message || 'Failed to update profile', 'danger');
      }
    });
  }

  openAddVehicle() {
    this.vehicleForm.reset();
    this.editingVehicleId = null;
    this.showAddVehicle = true;
  }

  editVehicle(vehicle: Vehicle) {
    this.vehicleForm.patchValue({
      licensePlate: vehicle.licensePlate,
      brand: vehicle.brand,
      model: vehicle.model
    });
    this.editingVehicleId = vehicle.id;
    this.showAddVehicle = true;
  }

  closeAddVehicle() {
    this.showAddVehicle = false;
    this.editingVehicleId = null;
  }

  async saveVehicle() {
    if (this.vehicleForm.invalid) return;

    const loading = await this.loadingCtrl.create({
      message: this.editingVehicleId ? 'Updating...' : 'Adding...',
    });
    await loading.present();

    const vehicleData = {
      ...this.vehicleForm.value,
      isDefault: this.vehicles.length === 0
    };

    if (this.editingVehicleId) {
      this.userService.updateVehicle(this.editingVehicleId, vehicleData).subscribe({
        next: async () => {
          await loading.dismiss();
          this.closeAddVehicle();
          this.loadVehicles();
          this.showToast('Vehicle updated!', 'success');
        },
        error: async (err) => {
          await loading.dismiss();
          this.showToast(err.error?.message || 'Failed to update vehicle', 'danger');
        }
      });
    } else {
      this.userService.addVehicle(vehicleData).subscribe({
        next: async () => {
          await loading.dismiss();
          this.closeAddVehicle();
          this.loadVehicles();
          this.showToast('Vehicle added!', 'success');
        },
        error: async (err) => {
          await loading.dismiss();
          this.showToast(err.error?.message || 'Failed to add vehicle', 'danger');
        }
      });
    }
  }

  async deleteVehicle(vehicle: Vehicle) {
    const alert = await this.alertCtrl.create({
      header: 'Delete Vehicle',
      message: `Are you sure you want to remove ${vehicle.licensePlate}?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            const loading = await this.loadingCtrl.create({
              message: 'Deleting...',
            });
            await loading.present();

            this.userService.deleteVehicle(vehicle.id).subscribe({
              next: async () => {
                await loading.dismiss();
                this.loadVehicles();
                this.showToast('Vehicle removed', 'success');
              },
              error: async (err) => {
                await loading.dismiss();
                this.showToast(err.error?.message || 'Failed to delete vehicle', 'danger');
              }
            });
          }
        }
      ]
    });
    await alert.present();
  }

  async setDefaultVehicle(vehicle: Vehicle) {
    const loading = await this.loadingCtrl.create({
      message: 'Updating...',
    });
    await loading.present();

    this.userService.setDefaultVehicle(vehicle.id).subscribe({
      next: async () => {
        await loading.dismiss();
        this.loadVehicles();
        this.showToast(`${vehicle.licensePlate} set as default`, 'success');
      },
      error: async (err) => {
        await loading.dismiss();
        this.showToast(err.error?.message || 'Failed to set default vehicle', 'danger');
      }
    });
  }

  // Backend uses 'completed' for paid; support both for compatibility
  isSessionPaid(session: ParkingSession): boolean {
    const status = session.payment?.status;
    return status === 'paid' || status === 'completed';
  }

  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Logout',
          handler: () => {
            this.authService.logout();
          }
        }
      ]
    });
    await alert.present();
  }

  retryLoadVehicles() {
    this.loadVehicles();
  }

  retryLoadHistory() {
    this.loadParkingHistory();
  }

  // Payment methods for unpaid sessions
  payForSession(session: ParkingSession) {
    const amount = session.totalAmount || session.currentAmount || 0;
    const paymentId = session.payment?.id || session.id;
    
    this.router.navigate(['/payment'], {
      queryParams: {
        sessionId: session.id,
        paymentId: paymentId,
        amount: amount
      }
    });
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
