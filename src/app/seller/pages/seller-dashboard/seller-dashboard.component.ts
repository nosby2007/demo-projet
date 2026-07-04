import { Component } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Seller, SellerOrder, SellerProduct } from '../../models/seller.model';
import { SellerFirebaseService } from '../../services/seller-firebase.service';

@Component({
  selector: 'app-seller-dashboard',
  templateUrl: './seller-dashboard.component.html',
  styleUrls: ['./seller-dashboard.component.scss'],
})
export class SellerDashboardComponent {
  seller$ = this.sellerService.getCurrentSeller();
  products$ = this.sellerService.listMyProducts();
  orders$ = this.sellerService.listMyOrders();
  vm$: Observable<{
    seller: Seller | null;
    products: SellerProduct[];
    orders: SellerOrder[];
    activeProducts: number;
    openDeliveries: number;
    clientsToFollowUp: SellerOrder[];
  }> = combineLatest([this.seller$, this.products$, this.orders$]).pipe(
    map(([seller, products, orders]) => ({
      seller,
      products,
      orders,
      activeProducts: products.filter(product => product.status === 'active').length,
      openDeliveries: orders.filter(order => !['delivered', 'cancelled'].includes(order.deliveryStatus)).length,
      clientsToFollowUp: orders.filter(order => order.followUpStatus === 'to_contact').slice(0, 6),
    }))
  );

  deliveryStatuses = ['new', 'preparing', 'shipped', 'delivered', 'blocked', 'cancelled'] as const;

  constructor(private sellerService: SellerFirebaseService, private snackBar: MatSnackBar) {}

  async updateDelivery(order: SellerOrder, status: SellerOrder['deliveryStatus']): Promise<void> {
    try {
      await this.sellerService.updateDeliveryStatus(order, status);
      this.snackBar.open('Delivery updated.', 'OK', { duration: 2500 });
    } catch (error) {
      console.error(error);
      this.snackBar.open('Unable to update delivery.', 'OK', { duration: 4000 });
    }
  }

  async followUp(order: SellerOrder): Promise<void> {
    const note = window.prompt('Follow-up note for this customer', order.followUpNote || '');
    if (note === null) return;

    try {
      await this.sellerService.updateOrderFollowUp(order, note);
      this.snackBar.open('Customer follow-up recorded.', 'OK', { duration: 2500 });
    } catch (error) {
      console.error(error);
      this.snackBar.open('Unable to record follow-up.', 'OK', { duration: 4000 });
    }
  }
}
