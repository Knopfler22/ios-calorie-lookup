# 轻卡速查 · iOS 食物热量表

iOS 原生风格食物热量与三大营养素速查工具，支持：
- **本地网页 / PWA**（Windows 可直接预览，iPhone Safari 可添加到主屏幕）
- **iOS 侧载 App（`.ipa`）**：内置原生 `SwiftUI + WKWebView` 壳工程，纯离线运行、数据本地持久化，支持通过 **GitHub Actions 云端免费编译 `.ipa`**（无需 Mac）

## 一、在 Windows 上一键云端打包 `.ipa`（推荐）

由于编译 iOS `.ipa` 需要 macOS + Xcode，本项目已内置 `.github/workflows/build-ipa.yml`，可直接使用 GitHub 提供的免费 macOS 云端构建机自动出包：

1. 在 GitHub 上新建一个仓库（公开或私有均可）。
2. 将本项目推送到 GitHub：
   ```bash
   git init
   git add .
   git commit -m "feat: initial ios calorie lookup app"
   git branch -M main
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
3. 打开 GitHub 仓库顶部的 **Actions** 页面，等待 **Build iOS Sideload IPA** 运行完成（约 2~3 分钟），在页面底部的 **Artifacts** 中下载 `QingKaLookup-iOS-IPA`，解压即可得到 `QingKaLookup.ipa`。

> 以后每次修改 `data.js` 或界面代码并 `git push`，GitHub Actions 都会自动编译新版 `.ipa`。

## 二、如何侧载安装到 iPhone

拿到 `QingKaLookup.ipa` 后，选择任意你常用的侧载方式即可：

- **Sideloadly（Windows 最省事）**：
  1. iPhone 用数据线连接 Windows 电脑并信任电脑。
  2. 打开 Sideloadly，把 `QingKaLookup.ipa` 拖进去，输入自己的 Apple ID 点击 **Start** 自动签名安装。
  3. 首次打开前在 iPhone「设置 → 通用 → VPN 与设备管理」中信任该开发者证书；iOS 16+ 需在「隐私与安全性」底部开启「开发者模式」。
- **AltStore / SideStore**：直接将 `.ipa` 传到 iPhone，在 AltStore / SideStore 中选择 `+` 导入签名安装（支持 Wi-Fi 自动续签）。
- **TrollStore（巨魔商店，如系统版本支持）**：直接将 `.ipa` 分享到 TrollStore，永久免签安装。
- **爱思助手**：连接手机 →「应用游戏 → 导入安装」或使用「IPA 签名」功能。

## 三、如果你有 Mac

进入 `ios/` 目录执行：
```bash
brew install xcodegen librsvg
mkdir -p QingKaLookup/web
cp ../index.html ../styles.css ../data.js ../app.js ../icon.svg QingKaLookup/web/
rsvg-convert -w 1024 -h 1024 ../icon.svg -o QingKaLookup/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png
xcodegen generate
open QingKaLookup.xcodeproj
```
在 Xcode 中选择你的 Apple ID 签名即可直接真机运行或导出 `.ipa`。
