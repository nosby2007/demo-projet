// src/app/admin/admin-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminUserListComponent } from './pages/admin-user-list/admin-user-list.component';
import { AdminGuard } from './guards/admin.guard';
import { AdminShellComponent } from './shell/admin-shell/admin-shell.component';
// ⚠️ importe le BON composant que tu déclares réellement
import { AdminDashbordComponent } from './pages/admin-dashboard/admin-dashbord/admin-dashbord.component';
import { SellerRequestsComponent } from './pages/seller-requests/seller-requests.component';

const routes: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    canActivate: [AdminGuard],  // <-- class token (no parentheses)
    data: { roles: ['admin'] },  // <-- seulement les admins sont autorisés
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: AdminDashbordComponent },
      { path: 'users', component: AdminUserListComponent },
      { path: 'seller-requests', component: SellerRequestsComponent },
      
    ],
  },
];


@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminRoutingModule {}
