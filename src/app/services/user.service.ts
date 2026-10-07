import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService, User } from './auth.service';
import { StorageService } from './storage.service';

export interface Vehicle {
  id: string;
  licensePlate: string;
  brand: string;
  model: string;
  isDefault: boolean;
}

export interface UpdateProfileDto {
  name?: string;
  phone?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(
    private api: ApiService,
    private storage: StorageService
  ) {}

  // Backend: PUT /profile
  updateProfile(data: UpdateProfileDto): Observable<User> {
    return this.api.put<User>('/profile', {
      name: data.name,
      phone: data.phone
    }).pipe(
      tap(user => {
        this.storage.setUser(user);
      })
    );
  }

  // Vehicle management
  // Backend: GET /vehicles
  getVehicles(): Observable<Vehicle[]> {
    return this.api.get<Vehicle[]>('/vehicles');
  }

  // Backend: POST /vehicles
  addVehicle(vehicle: Omit<Vehicle, 'id'>): Observable<Vehicle> {
    return this.api.post<Vehicle>('/vehicles', {
      license_plate: vehicle.licensePlate,
      brand: vehicle.brand,
      model: vehicle.model,
      is_primary: vehicle.isDefault
    });
  }

  // Backend: PUT /vehicles/{id}
  updateVehicle(id: string, vehicle: Partial<Vehicle>): Observable<Vehicle> {
    const payload: any = {};
    if (vehicle.licensePlate !== undefined) payload.license_plate = vehicle.licensePlate;
    if (vehicle.brand !== undefined) payload.brand = vehicle.brand;
    if (vehicle.model !== undefined) payload.model = vehicle.model;
    return this.api.put<Vehicle>(`/vehicles/${id}`, payload);
  }

  // Backend: DELETE /vehicles/{id}
  deleteVehicle(id: string): Observable<void> {
    return this.api.delete<void>(`/vehicles/${id}`);
  }

  // Backend: POST /vehicles/{id}/set-primary
  setDefaultVehicle(id: string): Observable<Vehicle> {
    return this.api.post<Vehicle>(`/vehicles/${id}/set-primary`, {});
  }
}
