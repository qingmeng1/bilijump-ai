# Bilibili AI Skip

一个使用 AI 技术自动跳过 Bilibili 视频广告的 Chrome 扩展程序。

## 项目简介

**Bilibili AI Skip** 是一个 Chrome 扩展程序，旨在通过 AI 技术识别并自动跳过 Bilibili 视频中的广告。它支持字幕和音频分析，能够精准定位广告的开始和结束时间，并提供手动或自动跳过广告的功能。用户可以通过设置 API 密钥和模型来自定义 AI 分析行为。

[![Visit Official Website](https://img.shields.io/badge/Official%20Website-Visit%20Now-8E44AD?style=plastic&logo=globe&logoColor=white&labelColor=00CED1)](https://oooo.uno)
[![Get it on Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Get%20Now-1E90FF?style=plastic&logo=google-chrome&logoColor=white&labelColor=FF69B4)](https://chromewebstore.google.com/detail/lkhedimikicklpjmldabifgkhchnjjan)

**v2.3.6 更新：**
修复一些bug，优化prompt。

**v2.3.5 更新：**
在进度条中广告部分修改为橙色，让广告进度更清晰。

**v2.3.4 更新：**
添加一个内置 api（作者付费，仅支持 gpt-4o-mini）和三个优质第三方 api 选项。

**v2.3.3 更新：**
已上架应用商店。

---
## 功能特性

* ​**自动跳过广告**​：通过 AI 分析视频字幕或音频，识别广告并自动跳过。
* ​**手动跳过选项**​：如果未启用自动跳过，扩展会在广告时段显示弹窗，允许用户手动跳过。
* ​**字幕和音频分析**​：
  * 优先使用视频字幕进行广告识别。
  * 如果没有字幕，可选择使用音频分析（需用户授权）。
* ​**云端数据支持**​：通过 Cloudflare API 查询已缓存的广告数据，提升效率。
* ​**自定义设置**​：
  * 支持设置 OpenAI 或 Aliyun API 密钥、URL 和模型。
  * 可启用/禁用音频分析和自动跳过功能。
* ​**用户友好界面**​：提供直观的设置页面和实时弹窗提示。

## 安装步骤

1. ​**克隆或下载项目**​：

   `git clone https://github.com/qingmeng1/bilijump-ai.git`
   
   或者直接下载 ZIP 文件并解压。
2. ​**加载扩展到 Chrome**​：
   
   * 打开 Chrome 浏览器，进入 **chrome://extensions/**。
   * 启用右上角的“开发者模式”。
   * 点击“加载已解压的扩展程序”，选择项目文件夹。
3. ​**配置 API 密钥**​：
   
   * 点击扩展图标，打开设置页面。
   * 输入以下信息：
     * ​**API URL**​：例如 https://www.openai.com/v1/chat/completions 。
     * ​**API Key**​：你的 OpenAI API 密钥（例如 **sk-xxxxxx...**）。
     * ​**AI Model**​：使用的 AI 模型（例如 **gpt-4o-mini**）。
     * ​**Aliyun API Key**​：阿里云 API 密钥，用于音频分析（可通过 [阿里云文档](https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen) 申请）。
   * 保存设置。
4. ​**使用扩展**​：
   
   * 访问 Bilibili 视频页面（例如 https://www.bilibili.com/video/xxx ）。
   * 扩展会自动运行，识别广告并根据设置跳过。

## 使用方法

1. ​**启用扩展**​：
   * 在设置页面中，确保“启用扩展”选项已勾选。
2. ​**设置自动跳过**​：
   * 勾选“自动跳过广告”以启用自动跳过功能。
   * 如果未勾选，广告时段会显示弹窗，包含跳过按钮和倒计时。
3. ​**音频分析**​：
   * 如果视频没有字幕，扩展会提示是否启用音频分析。
   * 音频分析需要等待约 1 分钟，分析完成后会自动识别广告。
4. ​**查看状态**​：
   * 扩展会在视频播放器中显示弹窗，提示当前状态（如“AI 分析中...”或“广告已跳过”）。

## 技术细节

* ​**广告识别**​：
  * 使用 OpenAI API 分析字幕或音频内容，识别广告的开始和结束时间、产品名称及广告内容。
  * 20 秒以上的广告识别，并扩展到上下文相关内容。
* ​**音频处理**​：
  * 通过阿里云 DashScope API 进行音频转录（使用 **paraformer-v2** 模型）。
  * 支持中英文语言提示。
* ​**数据存储**​：
  * 使用 Cloudflare API 存储和查询广告数据，避免重复分析。
* ​**前端界面**​：
  * 设置页面使用 HTML 和 CSS 构建，提供直观的开关和输入框。
  * 视频页面中的弹窗使用动态样式，支持鼠标悬停效果。

## 依赖

* ​**Chrome 浏览器**​：需要支持 Manifest V3。
* ​**API 密钥**​：
  * OpenAI API 密钥（用于广告识别）。
  * 阿里云 API 密钥（用于音频分析）。

## 常见问题

* **为什么需要 API 密钥？**
  * API 密钥用于调用 OpenAI 和阿里云的 AI 服务，以进行广告识别和音频分析。
* **音频分析为什么需要等待？**
  * 音频分析需要将视频音频上传并处理，通常需要 1 分钟左右，具体时间取决于视频长度和服务器响应速度。
* **扩展无法识别广告怎么办？**
  * 确保 API 密钥和 URL 配置正确。
  * 检查视频是否有字幕或音频可用。
  * 尝试重新加载页面或联系开发者反馈问题。

## 许可证

本项目采用 MIT 许可
