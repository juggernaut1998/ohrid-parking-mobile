import { Injectable } from '@angular/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { BehaviorSubject, Observable, from } from 'rxjs';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private currentPositionSubject = new BehaviorSubject<Coordinates | null>(null);
  public currentPosition$ = this.currentPositionSubject.asObservable();

  private watchId: string | null = null;

  constructor() {}

  async checkPermissions(): Promise<boolean> {
    try {
      const status = await Geolocation.checkPermissions();
      return status.location === 'granted' || status.coarseLocation === 'granted';
    } catch {
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const status = await Geolocation.requestPermissions();
      return status.location === 'granted' || status.coarseLocation === 'granted';
    } catch {
      return false;
    }
  }

  async getCurrentPosition(): Promise<Coordinates | null> {
    try {
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        const granted = await this.requestPermissions();
        if (!granted) return null;
      }

      const position: Position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });

      console.log(position);

      const coords: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      this.currentPositionSubject.next(coords);
      return coords;
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  }

  async startWatching(): Promise<void> {
    try {
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        await this.requestPermissions();
      }

      this.watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true },
        (position, err) => {
          if (position) {
            this.currentPositionSubject.next({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            });
          }
          if (err) {
            console.error('Watch position error:', err);
          }
        }
      );
    } catch (error) {
      console.error('Error watching location:', error);
    }
  }

  async stopWatching(): Promise<void> {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
  }
}

