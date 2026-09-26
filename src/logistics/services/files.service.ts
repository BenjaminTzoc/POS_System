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
    return this.saveImage(file, 'caben-products', 800);
  }

  async saveTripIncidentImage(file: Express.Multer.File): Promise<string> {
    return this.saveImage(file, 'caben-trip-incidents', 1600);
  }

  async saveImage(file: Express.Multer.File, folder: string, maxSize = 800): Promise<string> {
    if (!file.mimetype || file.mimetype === 'application/octet-stream') {
      file.mimetype = 'image/jpeg';
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Solo se permiten archivos de imagen');
    }

    if (file.size > 15 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede ser mayor a 15MB');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [
            { width: maxSize, height: maxSize, crop: 'limit' },
            { quality: 'auto', fetch_format: 'auto' },
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

      const readableStream = new Readable();
      readableStream.push(file.buffer);
      readableStream.push(null);
      readableStream.pipe(uploadStream);
    });
  }

  async deleteProductImage(imageUrl: string): Promise<void> {
    return this.deleteImage(imageUrl);
  }

  async deleteImage(imageUrl: string): Promise<void> {
    if (!imageUrl) return;

    try {
      if (!imageUrl.includes('res.cloudinary.com')) return;
      const uploadIndex = imageUrl.indexOf('/upload/');
      if (uploadIndex === -1) return;
      const afterUpload = imageUrl.slice(uploadIndex + '/upload/'.length);
      const withoutVersion = afterUpload.replace(/^v\d+\//, '');
      const publicId = withoutVersion.replace(/\.[^/.]+$/, '').split('?')[0];
      if (!publicId) return;
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Imagen eliminada de Cloudinary: ${publicId}`);
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

