import { Component, OnInit, OnDestroy } from '@angular/core';
import { ParkingService } from '../services/parking.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit, OnDestroy {
  hasActiveSession = false;
  private sub: any;

  constructor(private parkingService: ParkingService) {}

  ngOnInit() {
    this.sub = this.parkingService.activeSession$.subscribe(session => {
      this.hasActiveSession = !!session;
    });
    this.parkingService.getActiveSession().subscribe();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
