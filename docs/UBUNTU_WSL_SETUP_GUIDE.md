# 🐧 Panduan Setup & Uji Coba Model di Ubuntu WSL

> **Target Pengguna:** Seluruh anggota tim AIT-201 (khususnya Person 1 ML & Person 2 API/Backend)  
> **Tujuan:** Menjalankan ekosistem Python Machine Learning (`scikit-learn`, `pandas`, `uv`) secara instan, bebas error perizinan Windows, dan 100% kompatibel dengan model Google Colab.

---

## 1. Mengapa Harus Menggunakan Ubuntu WSL?

Dalam proses pengembangan di Windows, tim menemukan dua kendala kritis:
1. **Windows Smart App Control (SAC):** Windows 11 secara default memblokir file C-extension unsigned (`.pyd` milik `pandas` dan `scikit-learn`) dengan pesan `Application Control policy has blocked this file`. Mematikan SAC sangat berisiko karena tidak bisa dinyalakan lagi tanpa instalasi ulang Windows.
2. **Kendala Alpine Linux (`musllinux`):** Alpine Linux menggunakan library `musl libc`, sedangkan hampir seluruh binary roda (*manylinux wheels*) di PyPI (termasuk NVIDIA CUDA dan Scikit-Learn) dirancang untuk `glibc` (Ubuntu/Debian). Mencoba install ML di Alpine memicu error kompilasi C++ (`Unknown compiler: cc/gcc`).

**Solusi Standar Industri:** Menggunakan **Ubuntu di WSL**. Di Ubuntu:
* 100% library ML terinstall instan (~0.2 detik via `uv`) karena menggunakan binary *manylinux*.
* Sepenuhnya kebal dan tidak terpengaruh oleh Smart App Control Windows.
* Smart App Control di Windows Anda tetap aman menyala (*ON*).

---

## 2. Langkah Setup Lengkap (Langkah demi Langkah)

### Langkah 1: Instalasi Ubuntu di Windows
Buka **PowerShell Windows** (Run as Administrator jika perlu), lalu jalankan:

```powershell
wsl --install -d Ubuntu
```

* Sistem akan mengunduh dan memasang Ubuntu.
* Masukkan **UNIX username** (contoh: `ivannov_kennedy`).
* Masukkan **Password** (karakter memang tidak tampil di layar demi keamanan).
* Pada opsi telemetry Canonical `[Y/n/e]`, ketik `n` lalu Enter.
* Terminal Anda akan beralih ke prompt hijau: `username@LAPTOP:~$`.

> *Catatan: Jika Ubuntu sudah pernah dipasang sebelumnya, cukup ketik `wsl -d Ubuntu` di PowerShell.*

---

### Langkah 2: Masuk ke Folder Proyek
Di dalam terminal Ubuntu, navigasikan ke lokasi repositori di partisi Windows (`/mnt/c/`):

```bash
cd "/mnt/c/Coding/University/Univ Codes/final-ait201"
```

---

### Langkah 3: Pasang `uv` (Ultra-Fast Python Package Manager)
Jalankan skrip instalasi resmi Astral `uv`:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env
```
*(Proses instalasi `uv` hanya membutuhkan waktu ~1-2 detik).*

---

### Langkah 4: Buat Virtual Environment & Install Library ML

> [!IMPORTANT]
> **Best Practice WSL:** Buat virtual environment di dalam sistem file Linux asli (`~/.venv`), **BUKAN** di dalam folder `/mnt/c/`.  
> Menaruh venv di `/mnt/c/` (partisi NTFS Windows) dapat memicu error `Operation not permitted (os error 1)` akibat pembatasan izin file lintas sistem operasi.

Jalankan perintah berikut:

```bash
# 1. Buat venv di home directory Linux (~/.venv) dengan Python 3.12
uv venv ~/.venv --python 3.12

# 2. Aktifkan venv
source ~/.venv/bin/activate

# 3. Pasang library ML dengan versi yang sama persis dengan Google Colab (1.6.1)
uv pip install scikit-learn==1.6.1 pandas numpy joblib
```

*Instalasi 10 paket di atas via `uv` di Ubuntu selesai dalam waktu kurang dari **1 detik**!*

---

### Langkah 5: Jalankan Uji Coba Inferensi Model

Jalankan modul inferensi Spoilage Risk:

```bash
python src/ml/spoilage.py
```

#### ✅ Ekspektasi Hasil Output Sukses:
```text
✅ Pengujian independen: {'label': 'LOW', 'score': 0.655}
```

* **Penjelasan Output:**
  * Label `LOW` dan skor probabilitas `0.655` (65.5%) adalah hasil inferensi riil yang dihitung oleh 100 estimator Random Forest dari file `models/spoilage_classifier.pkl`.
  * Tidak ada error DLL.
  * Tidak ada `InconsistentVersionWarning` (karena scikit-learn di Ubuntu sudah 1.6.1 identik dengan Colab).

---

## 3. Menghubungkan Visual Studio Code ke WSL (Opsional tapi Sangat Nyaman)

Agar editor VS Code langsung menggunakan environment Ubuntu WSL ini:
1. Pasang ekstensi **WSL** resmi dari Microsoft di VS Code.
2. Buka proyek ini di VS Code.
3. Tekan `Ctrl + Shift + P` $\rightarrow$ ketik dan pilih: **WSL: Reopen Folder in WSL**.
4. Pilih interpreter Python di VS Code: arahkan ke `~/.venv/bin/python`.
5. Semua garis merah import di editor akan hilang seketika!

---

## 4. Cheat Sheet Pemeliharaan (Maintenance)

| Kebutuhan | Perintah / Solusi |
| :--- | :--- |
| **Masuk ke Ubuntu dari PowerShell** | `wsl -d Ubuntu` |
| **Mengaktifkan venv kembali** | `source ~/.venv/bin/activate` |
| **Bebaskan RAM WSL ke Windows** | Buka PowerShell Windows, jalankan: `wsl --shutdown` |
| **Retrain Model Baru** | Cukup simpan file baru ke `models/spoilage_classifier.pkl`, lalu jalankan `python src/ml/spoilage.py`. |

