import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './COMPONENT/home/home.component';

import { AssessmentFormComponent } from './features/skin-wound/components/assessment-form/assessment-form.component';
import { PatientDetailComponent } from './patients/pages/patient-detail/patient-detail.component';
import { RoleRedirectGuard } from './authentification/role-redirect.guard';
import { LoginComponent } from './authetification/login/login.component';

const routes: Routes = [
  {path:'login', component:LoginComponent,},
  { path: '', redirectTo: 'login', pathMatch: 'full' },


  { path: '', canActivate: [RoleRedirectGuard], component: HomeComponent },
   // ===== Per-patient clinical modules =====
  { path: 'emar', loadChildren: () => import('./modules/emar/emar.module').then(m => m.EmarModule) },
  { path: 'mds', loadChildren: () => import('./modules/mds/mds.module').then(m => m.MdsModule) },
  { path: 'care-plans', loadChildren: () => import('./modules/care-plans/care-plans.module').then(m => m.CarePlansModule) },
  { path: 'tasks', loadChildren: () => import('./modules/tasks/tasks.module').then(m => m.TasksModule) },
  { path: 'social', loadChildren: () => import('./modules/social/social.module').then(m => m.SocialModule) },
  { path: 'media', loadChildren: () => import('./modules/media/media.module').then(m => m.MediaModule) },
  


  { path: 'patients', loadChildren: () => import('./patients/patients.module').then(m => m.PatientsModule) },
  { path: 'skin-wound', loadChildren: () => import('./features/skin-wound/skin-wound.module').then(m => m.SkinWoundModule) },
  { path: 'admin', loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule) },
  { path: 'nurse', loadChildren: () => import('./nurse/nurse.module').then(m => m.NurseModule) },
  { path: 'seller', loadChildren: () => import('./seller/seller.module').then(m => m.SellerModule) },
   // ===== Global modules =====
  { path: 'finance', loadChildren: () => import('./modules/finance/finance.module').then(m => m.FinanceModule) },
  { path: 'housekeeping', loadChildren: () => import('./modules/housekeeping/housekeeping.module').then(m => m.HousekeepingModule) },
  { path: 'laundry', loadChildren: () => import('./modules/laundry/laundry.module').then(m => m.LaundryModule) },
  { path: 'reports', loadChildren: () => import('./modules/reports/reports.module').then(m => m.ReportsModule) },

  // Provider (déjà fourni précédemment)
  { path: 'provider', loadChildren: () => import('./modules/provider/provider.module').then(m => m.ProviderModule) },

  

  { path: '**', redirectTo: 'home' },

  
]; 



@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
