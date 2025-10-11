import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FilesService {
  private readonly uploadPath = './uploads/products';
  
  constructor() {
    this.ensureUploadDirectory();
  }

  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.access(this.uploadPath);
    } catch {
      await fs.mkdir(this.uploadPath, { recursive: true });
    }
  }

  async saveProductImage(file: Express.Multer.File): Promise<string> {
    // Validar tipo de archivo
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Solo se permiten archivos de imagen');
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede ser mayor a 5MB');
    }

    // Generar nombre único
    const fileExtension = path.extname(file.originalname);
    const fileName = `product-${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadPath, fileName);

    // Guardar archivo
    await fs.writeFile(filePath, file.buffer);
    
    return `/uploads/products/${fileName}`;
  }

  async deleteProductImage(imageUrl: string): Promise<void> {
    if (imageUrl && imageUrl.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), imageUrl);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Si el archivo no existe, no hay problema
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  // Obtener todas las extensiones permitidas
  get allowedMimeTypes(): string[] {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  }

  // Obtener tamaño máximo
  get maxFileSize(): number {
    return 5 * 1024 * 1024; // 5MB
  }
}
