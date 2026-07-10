<?php
// ============================================================
// Mini-CMS — panel administracyjny (logowanie + edycja treści/zdjęć)
// Wymaga PHP 7.4+ na serwerze. Na GitHub Pages nie działa (brak PHP) —
// to normalne; panel uruchomi się po przeniesieniu strony na hosting.
// ============================================================
session_start();

$ROOT        = dirname(__DIR__);                 // katalog strony (tam jest content.json)
$authFile    = __DIR__ . "/auth.json";
$contentFile = $ROOT . "/content.json";
$fields      = require __DIR__ . "/fields.php";
$auth        = json_decode(@file_get_contents($authFile), true) ?: [];

$content = json_decode(@file_get_contents($contentFile), true) ?: [];
if (!isset($content["texts"]))  $content["texts"]  = [];
if (!isset($content["images"])) $content["images"] = [];

if (empty($_SESSION["csrf"])) $_SESSION["csrf"] = bin2hex(random_bytes(16));
function csrf_ok() { return isset($_POST["csrf"]) && hash_equals($_SESSION["csrf"], $_POST["csrf"]); }
function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, "UTF-8"); }

$msg = ""; $err = "";
$action = $_POST["action"] ?? "";

if (isset($_GET["logout"])) { session_destroy(); header("Location: index.php"); exit; }

// ---- logowanie ----
if ($action === "login") {
  $u = trim($_POST["user"] ?? "");
  $p = $_POST["pass"] ?? "";
  if ($u === ($auth["user"] ?? "") && !empty($auth["hash"]) && password_verify($p, $auth["hash"])) {
    session_regenerate_id(true);
    $_SESSION["cms_auth"] = true;
    header("Location: index.php"); exit;
  }
  $err = "Błędny login lub hasło.";
}

$logged = !empty($_SESSION["cms_auth"]);

// ---- obsługa uploadu zdjęcia ----
function handle_upload($key, $ROOT) {
  $f = $_FILES["img"];
  if (($f["error"][$key] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) return null;
  if (($f["size"][$key] ?? 0) > 6 * 1024 * 1024) return ["err" => "$key: plik za duży (max 6 MB)."];
  $info = @getimagesize($f["tmp_name"][$key]);
  if (!$info) return ["err" => "$key: to nie jest prawidłowy obraz."];
  $allowed = ["image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp"];
  if (!isset($allowed[$info["mime"]])) return ["err" => "$key: dozwolone tylko JPG / PNG / WebP."];
  $ext = $allowed[$info["mime"]];
  $dir = $ROOT . "/assets/img/uploads";
  if (!is_dir($dir)) @mkdir($dir, 0775, true);
  $safe = preg_replace("/[^a-z0-9_-]/i", "", $key);
  $fname = $safe . "-" . time() . "." . $ext;
  if (!move_uploaded_file($f["tmp_name"][$key], $dir . "/" . $fname)) return ["err" => "$key: nie udało się zapisać pliku."];
  return ["path" => "assets/img/uploads/" . $fname];
}

// ---- zapis treści ----
if ($logged && $action === "save") {
  if (!csrf_ok()) { $err = "Sesja wygasła — odśwież i spróbuj ponownie."; }
  else {
    foreach ($fields["texts"] as $fld) {
      $k = $fld["key"];
      if (isset($_POST["t"][$k])) $content["texts"][$k] = trim($_POST["t"][$k]);
    }
    if (!empty($_FILES["img"]["name"])) {
      foreach ($fields["images"] as $fld) {
        $k = $fld["key"];
        if (!empty($_FILES["img"]["name"][$k])) {
          $res = handle_upload($k, $ROOT);
          if ($res && isset($res["path"])) $content["images"][$k] = $res["path"];
          elseif ($res && isset($res["err"])) $err .= $res["err"] . " ";
        }
      }
    }
    $ok = @file_put_contents(
      $contentFile,
      json_encode($content, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    );
    if ($ok === false) $err .= "Nie udało się zapisać content.json (sprawdź uprawnienia zapisu). ";
    if (!$err) $msg = "Zapisano ✓  Wejdź na stronę i odśwież na twardo (Ctrl+F5), aby zobaczyć zmiany.";
  }
}

// ---- zmiana hasła ----
if ($logged && $action === "passwd") {
  if (!csrf_ok()) { $err = "Sesja wygasła — spróbuj ponownie."; }
  else {
    $np = $_POST["newpass"] ?? "";
    if (strlen($np) < 8) $err = "Nowe hasło musi mieć min. 8 znaków.";
    else {
      $auth["user"] = $auth["user"] ?? "admin";
      $auth["hash"] = password_hash($np, PASSWORD_DEFAULT);
      if (@file_put_contents($authFile, json_encode($auth, JSON_PRETTY_PRINT)) === false) $err = "Nie udało się zapisać nowego hasła (uprawnienia).";
      else $msg = "Hasło zmienione ✓";
    }
  }
}

$csrf = $_SESSION["csrf"];
?>
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Panel treści — Świat Pergoli</title>
<style>
  :root { --ink:#14120f; --paper:#f1ebe0; --copper:#b97f52; --ember:#c1502a; --line:#e0d8c8; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:#efe9df; color:var(--ink); }
  header { display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding:16px clamp(16px,4vw,40px); background:var(--ink); color:var(--paper); position:sticky; top:0; z-index:5; }
  header b { letter-spacing:.14em; text-transform:uppercase; font-size:14px; }
  header a { color:#d29b63; text-decoration:none; font-size:13px; }
  main { max-width:820px; margin:0 auto; padding:clamp(16px,4vw,40px); }
  .card { background:#fff; border:1px solid var(--line); border-radius:14px; padding:clamp(18px,3vw,28px); margin-bottom:22px; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.08em; color:#7a7263; margin:0 0 16px; }
  label { display:block; font-weight:600; font-size:14px; margin:14px 0 6px; }
  input[type=text], textarea { width:100%; padding:11px 13px; border:1px solid var(--line); border-radius:9px; font-size:15px; font-family:inherit; background:#fdfcfa; }
  textarea { min-height:74px; resize:vertical; }
  input[type=file] { font-size:13px; margin-top:6px; }
  .imgrow { display:flex; gap:14px; align-items:center; padding:12px 0; border-top:1px solid #f0ece3; }
  .imgrow:first-of-type { border-top:0; }
  .imgrow img { width:104px; height:70px; object-fit:cover; border-radius:8px; border:1px solid var(--line); background:#eee; flex:none; }
  .imgrow .meta { flex:1; }
  .imgrow .meta b { font-size:14px; }
  .btn { display:inline-flex; align-items:center; gap:8px; border:0; border-radius:999px; cursor:pointer;
    padding:13px 26px; font-size:14px; font-weight:600; background:var(--copper); color:#1a1712; }
  .btn:hover { background:var(--ember); color:#fff; }
  .btn--ghost { background:transparent; border:1px solid #cdbfa8; color:#5a5142; }
  .note { font-size:13px; color:#7a7263; }
  .alert { padding:12px 15px; border-radius:9px; margin-bottom:18px; font-size:14px; }
  .alert--ok { background:#e6f2e2; color:#2f5d29; }
  .alert--err { background:#f6e2dc; color:#8a2f1c; }
  .save-bar { position:sticky; bottom:0; background:#efe9dfee; backdrop-filter:blur(4px); padding:14px 0; margin-top:8px; }
  .login { max-width:360px; margin:10vh auto; }
  fieldset { border:0; padding:0; margin:0; }
</style>
</head>
<body>
<header>
  <b>Świat Pergoli — panel treści</b>
  <?php if ($logged): ?><a href="?logout=1">Wyloguj →</a><?php endif; ?>
</header>
<main>

<?php if ($msg): ?><div class="alert alert--ok"><?= h($msg) ?></div><?php endif; ?>
<?php if ($err): ?><div class="alert alert--err"><?= h($err) ?></div><?php endif; ?>

<?php if (!$logged): ?>
  <form class="card login" method="post" autocomplete="off">
    <h1>Zaloguj się</h1>
    <p class="note">Wprowadź dane dostępu do panelu.</p>
    <input type="hidden" name="action" value="login">
    <label>Login</label>
    <input type="text" name="user" autofocus>
    <label>Hasło</label>
    <input type="text" name="pass" style="-webkit-text-security:disc;text-security:disc">
    <div style="margin-top:18px"><button class="btn" type="submit">Zaloguj</button></div>
  </form>
<?php else: ?>

  <form method="post" enctype="multipart/form-data">
    <input type="hidden" name="action" value="save">
    <input type="hidden" name="csrf" value="<?= h($csrf) ?>">

    <div class="card">
      <h1>Teksty</h1>
      <h2>Kliknij w pole, popraw treść i zapisz na dole</h2>
      <?php foreach ($fields["texts"] as $f):
        $k = $f["key"]; $v = $content["texts"][$k] ?? ""; ?>
        <label><?= h($f["label"]) ?></label>
        <?php if (($f["type"] ?? "text") === "textarea"): ?>
          <textarea name="t[<?= h($k) ?>]"><?= h($v) ?></textarea>
        <?php else: ?>
          <input type="text" name="t[<?= h($k) ?>]" value="<?= h($v) ?>">
        <?php endif; ?>
      <?php endforeach; ?>
      <p class="note" style="margin-top:14px">Puste pole = zostaje oryginalny tekst ze strony.</p>
    </div>

    <div class="card">
      <h1>Zdjęcia</h1>
      <h2>Wybierz nowy plik (JPG / PNG / WebP, do 6 MB)</h2>
      <?php foreach ($fields["images"] as $f):
        $k = $f["key"];
        $cur = $content["images"][$k] ?? $f["default"]; ?>
        <div class="imgrow">
          <img src="../<?= h($cur) ?>?v=<?= time() ?>" alt="">
          <div class="meta">
            <b><?= h($f["label"]) ?></b><br>
            <input type="file" name="img[<?= h($k) ?>]" accept="image/jpeg,image/png,image/webp">
          </div>
        </div>
      <?php endforeach; ?>
    </div>

    <div class="save-bar">
      <button class="btn" type="submit">Zapisz zmiany</button>
      <a class="note" href="../index.html" target="_blank" style="margin-left:14px">Podejrzyj stronę ↗</a>
    </div>
  </form>

  <div class="card" style="margin-top:26px">
    <h1>Zmień hasło</h1>
    <form method="post" autocomplete="off">
      <input type="hidden" name="action" value="passwd">
      <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
      <label>Nowe hasło (min. 8 znaków)</label>
      <input type="text" name="newpass" style="-webkit-text-security:disc;text-security:disc">
      <div style="margin-top:16px"><button class="btn btn--ghost" type="submit">Zmień hasło</button></div>
    </form>
  </div>

<?php endif; ?>
</main>
</body>
</html>
