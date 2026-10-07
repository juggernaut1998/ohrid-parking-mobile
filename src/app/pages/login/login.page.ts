import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule]
})
export class LoginPage implements OnInit {
  emailForm: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.emailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit() {
    if (this.authService.isLoggedIn) {
      this.navigateAfterLogin();
    }
  }

  async loginWithEmail() {
    if (this.emailForm.invalid) return;

    this.isLoading = true;
    const loading = await this.loadingCtrl.create({
      message: 'Sending code...',
    });
    await loading.present();

    this.authService.requestMagicLink(this.emailForm.value.email).subscribe({
      next: async (response: any) => {
        await loading.dismiss();
        this.isLoading = false;
        this.showToast(response.message || 'Check your email for the verification code.', 'success');
        this.router.navigateByUrl(`/verify-code?email=${this.emailForm.value.email}`, {
          replaceUrl: true
        });
      },
      error: async (err) => {
        await loading.dismiss();
        this.isLoading = false;
        this.showToast(err.error?.message || 'Login failed. Please try again.', 'danger');
      }
    });
  }

  private navigateAfterLogin() {
    const user = this.authService.currentUser;
    if (user?.profileComplete) {
      this.router.navigateByUrl('/tabs/map', { replaceUrl: true });
    } else {
      this.router.navigateByUrl('/setup-profile', { replaceUrl: true });
    }
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
