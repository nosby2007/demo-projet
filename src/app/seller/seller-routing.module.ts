import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SellerGuard } from './guards/seller.guard';
import { ProductManagementComponent } from './pages/product-management/product-management.component';
import { SellerDashboardComponent } from './pages/seller-dashboard/seller-dashboard.component';
import { SellerRequestFormComponent } from './pages/seller-request-form/seller-request-form.component';

const routes: Routes = [
  { path: 'request', component: SellerRequestFormComponent },
  {
    path: '',
    canActivate: [SellerGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: SellerDashboardComponent },
      { path: 'products', component: ProductManagementComponent },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SellerRoutingModule {}
