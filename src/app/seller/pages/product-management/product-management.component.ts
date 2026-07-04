import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SellerProduct } from '../../models/seller.model';
import { SellerFirebaseService } from '../../services/seller-firebase.service';

@Component({
  selector: 'app-product-management',
  templateUrl: './product-management.component.html',
  styleUrls: ['./product-management.component.scss'],
})
export class ProductManagementComponent {
  products$ = this.sellerService.listMyProducts();
  editingProductId = '';
  loading = false;

  form = this.fb.group({
    name: ['', Validators.required],
    sku: [''],
    category: ['', Validators.required],
    description: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0)]],
    imageUrl: [''],
    status: ['draft' as SellerProduct['status'], Validators.required],
  });

  constructor(
    private fb: FormBuilder,
    private sellerService: SellerFirebaseService,
    private snackBar: MatSnackBar
  ) {}

  edit(product: SellerProduct): void {
    this.editingProductId = product.id || '';
    this.form.patchValue({
      name: product.name,
      sku: product.sku || '',
      category: product.category,
      description: product.description || '',
      price: product.price,
      stock: product.stock,
      imageUrl: product.imageUrl || '',
      status: product.status,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  reset(): void {
    this.editingProductId = '';
    this.form.reset({ price: 0, stock: 0, status: 'draft' });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    try {
      const value = this.form.getRawValue();
      await this.sellerService.saveProduct({
        id: this.editingProductId || undefined,
        name: value.name || '',
        sku: value.sku || '',
        category: value.category || '',
        description: value.description || '',
        price: Number(value.price || 0),
        stock: Number(value.stock || 0),
        imageUrl: value.imageUrl || '',
        status: (value.status || 'draft') as SellerProduct['status'],
      });
      this.snackBar.open('Product saved.', 'OK', { duration: 2500 });
      this.reset();
    } catch (error) {
      console.error(error);
      this.snackBar.open('Unable to save product.', 'OK', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  async archive(product: SellerProduct): Promise<void> {
    if (!product.id || !confirm(`Archive ${product.name}?`)) return;
    await this.sellerService.archiveProduct(product.id);
    this.snackBar.open('Product archived.', 'OK', { duration: 2500 });
  }
}
