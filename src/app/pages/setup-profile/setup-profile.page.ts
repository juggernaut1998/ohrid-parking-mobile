import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-setup-profile',
  templateUrl: './setup-profile.page.html',
  styleUrls: ['./setup-profile.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule]
})
export class SetupProfilePage implements OnInit {
  currentStep = 1;
  profileForm: FormGroup;
  vehicleForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private authService: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.profileForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^[\d\s\-\+\(\)]{8,25}$/)]]
    });

    this.vehicleForm = this.fb.group({
      licensePlate: ['', [Validators.required, Validators.minLength(4)]],
      brand: ['', Validators.required],
      model: ['', Validators.required]
    });
  }

  ngOnInit() {
    const user = this.authService.currentUser;
    if (user) {
      this.profileForm.patchValue({
        name: user.name || '',
        phone: user.phone || ''
      });
    }
  }

  async saveProfile() {
    if (this.profileForm.invalid) return;

    const loading = await this.loadingCtrl.create({
      message: 'Saving profile...',
    });
    await loading.present();

    this.userService.updateProfile(this.profileForm.value).subscribe({
      next: async () => {
        await loading.dismiss();
        this.currentStep = 2;
      },
      error: async (err) => {
        await loading.dismiss();
        this.showToast(err.error?.message || 'Failed to save profile', 'danger');
      }
    });
  }

  async addVehicle() {
    if (this.vehicleForm.invalid) return;

    const loading = await this.loadingCtrl.create({
      message: 'Adding vehicle...',
    });
    await loading.present();

    const vehicleData = {
      ...this.vehicleForm.value,
      isDefault: true
    };

    this.userService.addVehicle(vehicleData).subscribe({
      next: async () => {
        await loading.dismiss();
        await this.authService.refreshUser().toPromise();
        this.showToast('Setup complete! Welcome aboard!', 'success');
        this.router.navigate(['/tabs/map']);
      },
      error: async (err) => {
        await loading.dismiss();
        this.showToast(err.error?.message || 'Failed to add vehicle', 'danger');
      }
    });
  }

  skipVehicle() {
    this.authService.refreshUser().subscribe(() => {
      this.router.navigate(['/tabs/map']);
    });
  }

  goBack() {
    this.currentStep = 1;
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

