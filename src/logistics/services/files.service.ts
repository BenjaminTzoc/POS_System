import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name:
        this.configService.get<string>('CLOUD_NAME') ||
        this.configService.get<string>('CLOUDINARY_CLOUD_NAME') ||
        process.env.CLOUD_NAME ||
        process.env.CLOUDINARY_CLOUD_NAME,
      api_key:
        this.configService.get<string>('CLOUD_API_KEY') ||
        this.configService.get<string>('CLOUDINARY_API_KEY') ||
        process.env.CLOUD_API_KEY ||
        process.env.CLOUDINARY_API_KEY,
      api_secret:
        this.configService.get<string>('CLOUD_API_SECRET') ||
        this.configService.get<string>('CLOUDINARY_API_SECRET') ||
        process.env.CLOUD_API_SECRET ||
        process.env.CLOUDINARY_API_SECRET,
    });
  }

  async saveProductImage(file: Express.Multer.File): Promise<string> {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Solo se permiten archivos de imagen');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede ser mayor a 5MB');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'caben-products',
          resource_type: 'image',
          transformation: [
            { width: 800, height: 800, crop: 'limit' }, // Redimensiona si es gigante (ej: foto de celular de 4000px), sin deformar
            { quality: 'auto', fetch_format: 'auto' },   // Convierte automáticamente a WebP/AVIF y comprime sin pérdida perceptible
          ],
        },
        (error, result: UploadApiResponse) => {
          if (error) {
            this.logger.error('Error al subir imagen a Cloudinary', error);
            return reject(new BadRequestException('Error al subir imagen a Cloudinary: ' + error.message));
          }
          resolve(result.secure_url);
        },
      );

      // Convertir el buffer de multer a stream para Cloudinary
      const readableStream = new Readable();
      readableStream.push(file.buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  }

  async deleteProductImage(imageUrl: string): Promise<void> {
    if (!imageUrl) return;

    try {
      // Si es una URL de Cloudinary, extraer el public_id
      if (imageUrl.includes('res.cloudinary.com')) {
        // Ejemplo URL: https://res.cloudinary.com/demo/image/upload/v12345/caben-products/xyz.jpg
        const parts = imageUrl.split('/');
        const folderIndex = parts.indexOf('caben-products');
        if (folderIndex !== -1) {
          const publicIdWithExt = parts.slice(folderIndex).join('/');
          const publicId = publicIdWithExt.replace(/\.[^/.]+$/, ''); // quitar extensión
          await cloudinary.uploader.destroy(publicId);
          this.logger.log(`Imagen eliminada de Cloudinary: ${publicId}`);
        }
      }
    } catch (error) {
      this.logger.warn(`No se pudo eliminar la imagen previa en Cloudinary: ${error.message}`);
    }
  }

  get allowedMimeTypes(): string[] {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  }

  get maxFileSize(): number {
    return 5 * 1024 * 1024;
  }
}

