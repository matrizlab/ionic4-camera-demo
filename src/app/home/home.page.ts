import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { Camera, CameraOptions, PictureSourceType } from '@ionic-native/Camera/ngx';
import { ActionSheetController, ToastController, Platform, LoadingController } from '@ionic/angular';
import { File, FileEntry } from '@ionic-native/File/ngx';
import { WebView } from '@ionic-native/ionic-webview/ngx';
import { Storage } from '@ionic/storage';
import { FilePath } from '@ionic-native/file-path/ngx';

import { finalize } from 'rxjs/operators';

import { environment } from '../../environments/environment';
 
const STORAGE_KEY = 'my_images';
 
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit {
  [x: string]: any;

  images = [];

  constructor(private camera: Camera, private file: File, private http: HttpClient, private webview: WebView,
// tslint:disable-next-line: align
    private actionSheetController: ActionSheetController, private toastController: ToastController,
    // tslint:disable-next-line:align
    private storage: Storage, private plt: Platform, private loadingController: LoadingController,
              private ref: ChangeDetectorRef, private filePath: FilePath) { }

  ngOnInit() {
    this.plt.ready().then(() => {
      this.loadStoredImages();
    });
  }

  loadStoredImages() {
    this.storage.get(STORAGE_KEY).then(images => {
      if (images) {
        const arr = JSON.parse(images);
        this.images = [];
        for (const img of arr) {
          const filePath = this.file.dataDirectory + img;
          const resPath = this.pathForImage(filePath);
          this.images.push({ name: img, path: resPath, filePath: filePath });
        }
      }
    });
  }

  pathForImage(img) {
    if (img === null) {
      return '';
    } else {
      const converted = this.webview.convertFileSrc(img);
      return converted;
    }
  }
 
  async presentToast(text) {
    const toast = await this.toastController.create({
        message: text,
        position: 'bottom',
        duration: 3000
    });
    toast.present();
  }

  async selectImage() {
      const actionSheet = await this.actionSheetController.create({
          header: 'Selezione sorgente',
          buttons: [{
                  text: 'Carica dalla libreria',
                  handler: () => {
                      this.takePicture(this.camera.PictureSourceType.PHOTOLIBRARY);
                  }
              },
              {
                  text: 'Camera',
                  handler: () => {
                      this.takePicture(this.camera.PictureSourceType.CAMERA);
                  }
              },
              {
                  text: 'Cancella',
                  role: 'cancel'
              }
          ]
      });
      await actionSheet.present();
  }

takePicture(sourceType: PictureSourceType) {
      var options: CameraOptions = {
          quality: 100,
          sourceType: sourceType,
          saveToPhotoAlbum: false,
          correctOrientation: true
      };
  
      this.camera.getPicture(options).then(imagePath => {
          if (this.plt.is('android') && sourceType === this.camera.PictureSourceType.PHOTOLIBRARY) {
              this.filePath.resolveNativePath(imagePath)
                  .then(filePath => {
                      const correctPath = filePath.substr(0, filePath.lastIndexOf('/') + 1);
                      const currentName = imagePath.substring(imagePath.lastIndexOf('/') + 1, imagePath.lastIndexOf('?'));
                      this.copyFileToLocalDir(correctPath, currentName, this.createFileName());
                  });
          } else {
              var currentName = imagePath.substr(imagePath.lastIndexOf('/') + 1);
              var correctPath = imagePath.substr(0, imagePath.lastIndexOf('/') + 1);
              this.copyFileToLocalDir(correctPath, currentName, this.createFileName());
          }
      });
  
  }
  createFileName() {
    var d = new Date(),
        n = d.getTime(),
        newFileName = n + ".jpg";
    return newFileName;
}
 
copyFileToLocalDir(namePath, currentName, newFileName) {
      this.file.copyFile(namePath, currentName, this.file.dataDirectory, newFileName).then(success => {
          this.updateStoredImages(newFileName);
      }, error => {
          this.presentToast('Error while storing file.');
      });
  }

updateStoredImages(name) {
      this.storage.get(STORAGE_KEY).then(images => {
          const arr = JSON.parse(images);
          if (!arr) {
              const newImages = [name];
              this.storage.set(STORAGE_KEY, JSON.stringify(newImages));
          } else {
              arr.push(name);
              this.storage.set(STORAGE_KEY, JSON.stringify(arr));
          }
  
          const filePath = this.file.dataDirectory + name;
          const resPath = this.pathForImage(filePath);
  
          const newEntry = {
              name: name,
              path: resPath,
              filePath: filePath
          };
  
          this.images = [newEntry, ...this.images];
          this.ref.detectChanges(); // trigger change detection cycle
      });
  }

  deleteImage(imgEntry, position) {
    this.images.splice(position, 1);
 
    this.storage.get(STORAGE_KEY).then(images => {
        const arr = JSON.parse(images);
        const filtered = arr.filter(name => name != imgEntry.name);
        this.storage.set(STORAGE_KEY, JSON.stringify(filtered));
 
        var correctPath = imgEntry.filePath.substr(0, imgEntry.filePath.lastIndexOf('/') + 1);
 
        this.file.removeFile(correctPath, imgEntry.name).then(res => {
            this.presentToast('File removed.');
        });
    });
}
startUpload(imgEntry) {
  this.file.resolveLocalFilesystemUrl(imgEntry.filePath)
      .then(entry => {
          ( < FileEntry > entry).file(file => this.readFile(file))
      })
      .catch(err => {
          this.presentToast('Error while reading file.');
      });
}

readFile(file: any) {
  const reader = new FileReader();
  reader.onloadend = () => {
      const formData = new FormData();
      const imgBlob = new Blob([reader.result], {
          type: file.type
      });
      formData.append('file', imgBlob, file.name);
      this.uploadImageData(formData, file);
  };
  reader.readAsArrayBuffer(file);
}

async uploadImageData(formData: FormData, file) {
    const httpOptions = {
        headers: new HttpHeaders({
          'Content-Disposition': `attachment;filename=${file.name}`,
          'Authorization': 'Bearer ' + environment.apiToken
        })
      };
  const loading = await this.loadingController.create({
    message: 'Please wait...',
  });
  await loading.present();

  this.http.post(
                environment.wpapiProd + `media`, 
                formData,
                httpOptions
        )
      .pipe(
          finalize(() => {
              loading.dismiss();
          })
        )
      .subscribe(res => {
          console.log(res);
          if (res['success']) {
              this.presentToast('File upload complete.')
          } else {
              this.presentToast('File upload failed.')
          }
      });
}
 
}
