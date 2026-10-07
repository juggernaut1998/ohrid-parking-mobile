import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';
import { Router } from '@angular/router';

export interface User {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  avatar?: string;
  profileComplete: boolean;
  walletBalance?: number;
  hasPendingPayments?: boolean;
  vehiclesCount?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
  message?: string;
  is_new_user?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private api: ApiService,
    private storage: StorageService,
    private router: Router
  ) {
    const user = this.storage.getUser();
    if (user) {
      this.currentUserSubject.next(user);
    }
  }

  get isLoggedIn(): boolean {
    return !!this.storage.getToken();
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  // Request verification code - sends code to email
  // Backend: POST /auth/request
  requestMagicLink(email: string): Observable<{ message: string; sent: boolean }> {
    return this.api.post<{ message: string; sent: boolean }>('/auth/request', { email });
  }

  // Verify code and get token
  // Backend: POST /auth/verify
  verifyCode(email: string, code: string): Observable<AuthResponse> {
    return this.api.post<AuthResponse>('/auth/verify', { email, code }).pipe(
      tap(response => this.handleAuthResponse(response))
    );
  }


  // Refresh user data
  // Backend: GET /profile
  refreshUser(): Observable<User> {
    return this.api.get<User>('/profile').pipe(
      tap(user => {
        this.storage.setUser(user);
        this.currentUserSubject.next(user);
      })
    );
  }

  private handleAuthResponse(response: AuthResponse): void {
    if (response.token) {
      this.storage.setToken(response.token);
    }
    if (response.user) {
      this.storage.setUser(response.user);
      this.currentUserSubject.next(response.user);
    }
  }

  // Logout
  // Backend: POST /auth/logout
  logout(): void {
    this.api.post('/auth/logout', {}).subscribe({
      complete: () => {
        this.clearSession();
      },
      error: () => {
        // Even if API fails, clear local storage and redirect
        this.clearSession();
      }
    });
  }

  private clearSession(): void {
    this.storage.clear();
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }
}
