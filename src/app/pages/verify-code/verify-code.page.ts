import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { IonicModule, LoadingController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-verify-code',
  templateUrl: './verify-code.page.html',
  styleUrls: ['./verify-code.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule]
})
export class VerifyCodePage implements OnInit {
  codeForm: FormGroup;
  email = '';
  isLoading = false;
  isResending = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.codeForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(6)]]
    });
  }

  ngOnInit() {
    this.email = this.route.snapshot.queryParams['email'] || '';
    if (!this.email) {
      this.router.navigate(['/login']);
    }
  }

  async verifyCode() {
    if (this.codeForm.invalid) return;

    const loading = await this.loadingCtrl.create({
      message: 'Verifying...',
    });
    await loading.present();

    this.authService.verifyCode(this.email, this.codeForm.value.code).subscribe({
      next: async () => {
        await loading.dismiss();
        this.navigateAfterVerify();
      },
      error: async (err) => {
        await loading.dismiss();
        this.showToast(err.error?.message || 'Invalid or expired code. Please try again.', 'danger');
      }
    });
  }

  private navigateAfterVerify() {
    const user = this.authService.currentUser;
    if (user?.profileComplete) {
      this.router.navigateByUrl('/tabs/map', {replaceUrl: true});
    } else {
      this.router.navigateByUrl('/setup-profile', {replaceUrl: true});
    }
  }

  goBack() {
    this.router.navigate(['/login']);
  }

  resendCode() {
    if (!this.email || this.isResending) return;

    this.isResending = true;
    this.authService.requestMagicLink(this.email).subscribe({
      next: async () => {
        this.isResending = false;
        this.showToast('A new code has been sent to your email', 'success');
      },
      error: async (err) => {
        this.isResending = false;
        this.showToast(err.error?.message || 'Failed to resend code. Please try again.', 'danger');
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
