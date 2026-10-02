# پوشهٔ لوگوی تسکنو

✅ **لوگو در سایت اعمال شد.** مربع موقتِ حرف «ت» از هدر و فوتر حذف شد و آیکون تب مرورگر هم تنظیم شد.

## ⚠️ نکتهٔ مهم دربارهٔ فایل‌های این پوشه

فایل‌هایی که اینجا گذاشته شد، با اینکه پسوندشان `.svg` است، **درواقع PNG** هستند:

| فایل | پسوند | محتوای واقعی |
| --- | --- | --- |
| `logo.svg` | `.svg` | PNG ۱۲۵۴×۱۲۵۴ |
| `logo-dark.svg` | `.svg` | PNG ۱۲۵۴×۱۲۵۴ |
| `logo.png` | `.png` | PNG ۱۲۵۴×۱۲۵۴ |
| `favicon.ico` | `.ico` | PNG ۳۲×۳۲ |

هر سه فایل `logo.svg` و `logo-dark.svg` و `logo.png` **دقیقاً یکسان** (بایت‌به‌بایت) هستند؛ یعنی نسخهٔ مخصوص حالت تاریک جداگانه‌ای وجود ندارد.

مرورگر فایلی با پسوند `.svg` که محتوایش PNG باشد را **رندر نمی‌کند** (چون MIME type اشتباه است). به همین دلیل سایت از همان `logo.png` که PNG واقعی است استفاده می‌کند.

## فایل‌های ساخته‌شده در سایت

از روی لوگوی شما این فایل‌ها ساخته شد (حاشیهٔ شفافِ اضافه بریده شد تا نشانه در سایزهای کوچک خوانا بماند):

| فایل | سایز | کاربرد |
| --- | --- | --- |
| `Website/public/logo.png` | ۵۱۲×۵۱۲ | هدر (۳۶px) و فوتر (۳۲px) |
| `Website/app/icon.png` | ۵۱۲×۵۱۲ | آیکون تب مرورگر (مرورگرهای مدرن) |
| `Website/app/apple-icon.png` | ۱۸۰×۱۸۰ | آیکون صفحهٔ اصلی در iOS |
| `Website/app/favicon.ico` | ۱۶/۳۲/۴۸/۶۴ | آیکون تب در مرورگرهای قدیمی |

`icon.png`، `apple-icon.png` و `favicon.ico` را خود Next.js به‌صورت خودکار به تگ‌های `<link rel="icon">` تبدیل می‌کند؛ نیازی به دست‌زدن به `layout.tsx` نیست.

## جاهایی که نمایش داده می‌شود

- هدر سایت (کنار نوشتهٔ «تسکنو») — [site-header.tsx](../Website/components/site-header.tsx)
- فوتر — [site-footer.tsx](../Website/components/site-footer.tsx)
- آیکون تب مرورگر — با فایل‌های `app/icon.png` و `app/favicon.ico`

## دربارهٔ حالت تاریک

لوگو پس‌زمینهٔ شفاف دارد و رنگش آبی/فیروزه‌ای روشن است، بنابراین روی تم روشن و تاریک هر دو خوانا است و **نیازی به نسخهٔ جداگانه برای حالت تاریک نیست**. اگر بعداً نسخهٔ تاریکِ متفاوتی خواستید، یک PNG واقعی با نام `logo-dark.png` اینجا بگذارید تا با کلاس `dark:` جایگزین شود.

## چطور لوگو را عوض کنم؟

۱. فایل جدید را به‌صورت **PNG مربعی با پس‌زمینهٔ شفاف** (حداقل ۵۱۲×۵۱۲) جایگزین `Logo/logo.png` کنید.
۲. این دستور را از ریشهٔ پروژه اجرا کنید تا همهٔ سایزها دوباره ساخته شوند:

```bash
python -c "from PIL import Image; im=Image.open('Logo/logo.png').convert('RGBA'); b=im.getchannel('A').point(lambda a:255 if a>12 else 0).getbbox(); m=im.crop(b); s=int(round(max(m.size)*1.14)); c=Image.new('RGBA',(s,s),(0,0,0,0)); c.paste(m,((s-m.width)//2,(s-m.height)//2),m); c.resize((512,512),Image.LANCZOS).save('Website/public/logo.png'); c.resize((512,512),Image.LANCZOS).save('Website/app/icon.png'); c.resize((180,180),Image.LANCZOS).save('Website/app/apple-icon.png'); c.resize((256,256),Image.LANCZOS).save('Website/app/favicon.ico',format='ICO',sizes=[(16,16),(32,32),(48,48),(64,64)]); print('ok')"
```

۳. اگر لوگوی برداری (SVG واقعی) دارید، همان را بگذارید تا در ادامه به SVG درون‌خطی تبدیلش کنم (کیفیت بهتر در همهٔ سایزها و حجم کمتر).
