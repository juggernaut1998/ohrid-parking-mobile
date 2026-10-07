import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage)
  },
  {
    path: 'verify-code',
    loadComponent: () => import('./pages/verify-code/verify-code.page').then(m => m.VerifyCodePage)
  },
  {
    path: 'setup-profile',
    loadComponent: () => import('./pages/setup-profile/setup-profile.page').then(m => m.SetupProfilePage),
    canActivate: [AuthGuard]
  },
  {
    path: 'payment',
    loadComponent: () => import('./pages/payment/payment.page').then(m => m.PaymentPage),
    canActivate: [AuthGuard]
  },
  {
    path: 'spot-details',
    loadComponent: () => import('./pages/spot-details/spot-details.page').then(m => m.SpotDetailsPage),
    canActivate: [AuthGuard]
  },
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule),
    canActivate: [AuthGuard]
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
