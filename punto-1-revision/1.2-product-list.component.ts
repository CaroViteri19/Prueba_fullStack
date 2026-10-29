import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, switchMap, catchError, tap } from 'rxjs/operators';
import { of } from 'rxjs';

interface Product {
  id: number;
  name: string;
  price: number;
}

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="product-search">
      <input
        type="text"
        [formControl]="searchControl"
        placeholder="Buscar productos..."
      />

      @if (loading) {
        <p>Cargando productos...</p>
      }

      @if (error) {
        <p class="error">{{ error }}</p>
      }

      <ul>
        @for (p of products; track p.id) {
          <li>{{ p.name }} - \${{ p.price }}</li>
        } @empty {
          @if (!loading && !error) {
            <li>No se encontraron productos.</li>
          }
        }
      </ul>
    </div>
  `,
})
export class ProductListComponent implements OnInit {
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);

  searchControl = new FormControl('', { nonNullable: true });
  products: Product[] = [];
  loading = false;
  error = '';

  ngOnInit(): void {
    this.searchControl.valueChanges
      .pipe(
        // Espera 350ms después de que el usuario deja de escribir
        debounceTime(350),
        // Evita disparar la petición si el texto es igual al anterior
        distinctUntilChanged(),
        tap(() => {
          this.loading = true;
          this.error = '';
        }),
        // switchMap cancela automáticamente la petición HTTP anterior si entra una nueva
        switchMap((term) =>
          this.http
            .get<Product[]>('/api/products', { params: { search: term.trim() } })
            .pipe(
              catchError((err) => {
                console.error('Error buscando productos:', err);
                this.error = 'No se pudieron cargar los productos. Intenta de nuevo.';
                return of([]); // Mantiene vivo el stream principal aunque falle una petición
              })
            )
        ),
        // Limpia la suscripción automáticamente al destruir el componente
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((results) => {
        this.products = results;
        this.loading = false;
      });
  }
}
