use std::collections::BTreeMap;
use std::io::Read;

use serde_json::Value as JsonValue;

/// Everything needed to write a course package to disk and upsert it into
/// db.json, already fully validated against `protocol/protocol.md` (Bundler
/// Protocol v1.1.5). Holds owned file bytes rather than borrowing the zip
/// archive so it can be built once and reused by both `validate_course_bundle`
/// (dry run) and `import_course_bundle` (validate again, then write).
#[derive(Debug)]
pub struct ValidatedBundle {
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub published: bool,
    pub sequential_play: bool,
    pub force_checkpoint: bool,
    pub version: String,
    pub changelog: String,
    pub bundler_protocol_version: String,
    pub target_age: String,
    pub category: String,
    pub tags: Vec<String>,
    pub license: String,
    pub license_file: Option<String>,
    pub author: JsonValue,
    pub toc: JsonValue,
    pub cards: Vec<String>,
    pub wiki: String,
    pub manifest_thumbnail: Option<String>,
    /// All non-directory zip entries, normalized to forward-slash paths,
    /// verbatim bytes — written as-is under the course's storage folder on import.
    pub entries: BTreeMap<String, Vec<u8>>,
}

pub fn validate(zip_bytes: &[u8]) -> Result<ValidatedBundle, String> {
    let entries = read_zip_entries(zip_bytes)?;

    let manifest_bytes = entries
        .get("package-manifest.json")
        .ok_or_else(|| "package-manifest.json 파일이 존재하지 않습니다.".to_string())?;
    let manifest: JsonValue = serde_json::from_slice(manifest_bytes)
        .map_err(|e| format!("package-manifest.json JSON 문법 에러: {e}"))?;

    let title = manifest
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "package-manifest.json에 title 필드가 누락되었습니다.".to_string())?
        .to_string();

    let target_age = manifest
        .get("target_age")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "package-manifest.json에 target_age 필드가 누락되었습니다.".to_string())?
        .to_string();
    if !is_valid_target_age(&target_age) {
        return Err("package-manifest.json의 target_age가 규격(all, 10+, 8-13 등)에 맞지 않습니다.".to_string());
    }

    let category = manifest
        .get("category")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "package-manifest.json에 category 필드가 누락되었습니다.".to_string())?
        .to_string();

    let bundler_protocol_version = manifest
        .get("bundler_protocol_version")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "package-manifest.json에 bundler_protocol_version 필드가 누락되었습니다.".to_string())?
        .to_string();

    let author = manifest
        .get("author")
        .filter(|v| v.is_object())
        .cloned()
        .ok_or_else(|| "package-manifest.json에 author (작성자 정보) 객체가 누락되었거나 유효하지 않습니다.".to_string())?;
    let author_nickname = author
        .get("nickname")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if author_nickname.is_none() {
        return Err("package-manifest.json의 author.nickname 필드가 누락되었거나 유효하지 않습니다.".to_string());
    }

    let tags: Vec<String> = match manifest.get("tags") {
        None | Some(JsonValue::Null) => Vec::new(),
        Some(JsonValue::Array(arr)) => arr.iter().map(|v| v.as_str().unwrap_or_default().to_string()).collect(),
        Some(_) => return Err("package-manifest.json의 tags는 문자열 배열(Array) 형태여야 합니다.".to_string()),
    };

    const ALLOWED_LICENSES: [&str; 9] = [
        "CC-BY-4.0",
        "CC-BY-SA-4.0",
        "CC-BY-NC-4.0",
        "CC-BY-NC-SA-4.0",
        "CC-BY-ND-4.0",
        "CC-BY-NC-ND-4.0",
        "CC0-1.0",
        "all-rights-reserved",
        "custom",
    ];
    let license = manifest
        .get("license")
        .and_then(|v| v.as_str())
        .unwrap_or("all-rights-reserved")
        .to_string();
    if !ALLOWED_LICENSES.contains(&license.as_str()) {
        return Err("package-manifest.json의 license 값이 올바르지 않습니다.".to_string());
    }
    let license_file = manifest
        .get("license_file")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    if license == "custom" && license_file.is_none() {
        return Err("license가 custom일 때 license_file 필드는 필수입니다.".to_string());
    }
    if let Some(lf) = &license_file {
        if !entries.contains_key(lf) {
            return Err(format!("package-manifest.json에 지정된 라이선스 파일 '{lf}'이(가) ZIP 루트에 존재하지 않습니다."));
        }
    }

    let raw_slug = manifest
        .get("slug")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let slug = raw_slug.unwrap_or_else(|| slugify(&title));
    if slug.is_empty() {
        return Err("title에서 자동 생성된 slug가 비어 있습니다. package-manifest.json에 slug 필드를 직접 지정해주세요.".to_string());
    }

    // --- config.json (TOC + cards) ---
    let config_bytes = entries
        .get("config.json")
        .ok_or_else(|| "config.json 파일이 존재하지 않습니다.".to_string())?;
    let config: JsonValue =
        serde_json::from_slice(config_bytes).map_err(|e| format!("config.json JSON 문법 에러: {e}"))?;

    let cards: Vec<String> = config
        .get("cards")
        .and_then(|v| v.as_array())
        .filter(|arr| !arr.is_empty())
        .ok_or_else(|| "config.json 내에 cards 배열이 누락되었거나 비어있습니다.".to_string())?
        .iter()
        .map(|v| v.as_str().unwrap_or_default().to_string())
        .collect();

    let toc_array = config
        .get("toc")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "config.json 내에 toc(목차) 필드가 누락되었습니다.".to_string())?;

    let mut collected_filenames: Vec<String> = Vec::new();
    validate_toc_recursive(toc_array, "toc", &mut collected_filenames)?;

    {
        let cards_set: std::collections::HashSet<&String> = cards.iter().collect();
        if cards_set.len() != cards.len() {
            return Err("cards 배열에 중복된 파일 이름이 존재합니다.".to_string());
        }
        let collected_set: std::collections::HashSet<&String> = collected_filenames.iter().collect();
        if collected_set.len() != collected_filenames.len() {
            return Err("TOC 내에 중복된 filename이 존재합니다.".to_string());
        }
        if cards_set.len() != collected_set.len() {
            return Err(format!(
                "cards 개수({})와 toc의 filename 개수({})가 일치하지 않습니다.",
                cards_set.len(),
                collected_set.len()
            ));
        }
        for card in &cards {
            if !collected_set.contains(card) {
                return Err(format!("cards 배열 파일명 '{card}'이(가) toc의 최하단 노드 filename에 정의되어 있지 않습니다."));
            }
            if !entries.contains_key(&format!("cards/{card}")) {
                return Err(format!("cards/ 폴더 내에 '{card}' 파일이 실제 존재하지 않습니다."));
            }
        }
    }

    // Video card (`cards/*.json`) schema — protocol.md §6.4.
    for card in &cards {
        if !card.ends_with(".json") {
            continue;
        }
        let bytes = entries.get(&format!("cards/{card}")).expect("existence already checked above");
        let video_card: JsonValue =
            serde_json::from_slice(bytes).map_err(|e| format!("동영상 카드 '{card}' JSON 파싱 실패: {e}"))?;

        let has_title = video_card.get("title").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).is_some();
        if !has_title {
            return Err(format!("동영상 카드 '{card}'에 title 필드가 누락되었습니다."));
        }
        if video_card.get("type").and_then(|v| v.as_str()) != Some("video") {
            return Err(format!("동영상 카드 '{card}'의 type은 반드시 \"video\"여야 합니다."));
        }
        let video_info = video_card
            .get("video_info")
            .filter(|v| v.is_object())
            .ok_or_else(|| format!("동영상 카드 '{card}'에 video_info 객체가 누락되었습니다."))?;
        if video_info.get("provider").and_then(|v| v.as_str()) != Some("youtube") {
            return Err(format!("동영상 카드 '{card}'의 video_info.provider는 현재 \"youtube\"만 지원합니다."));
        }
        let has_video_id = video_info.get("video_id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).is_some();
        if !has_video_id {
            return Err(format!("동영상 카드 '{card}'에 video_info.video_id가 누락되었습니다."));
        }
        if let Some(subs) = video_info.get("subtitles") {
            if !subs.is_array() {
                return Err(format!("동영상 카드 '{card}'의 video_info.subtitles는 배열이어야 합니다."));
            }
        }
    }

    let wiki_bytes = entries.get("wiki.md").ok_or_else(|| "wiki.md 파일이 존재하지 않습니다.".to_string())?;
    let wiki = String::from_utf8_lossy(wiki_bytes).to_string();

    Ok(ValidatedBundle {
        slug,
        title,
        description: manifest.get("description").and_then(|v| v.as_str()).map(str::to_string),
        published: manifest.get("published").and_then(|v| v.as_bool()).unwrap_or(true),
        sequential_play: manifest.get("sequential_play").and_then(|v| v.as_bool()).unwrap_or(false),
        force_checkpoint: manifest.get("force_checkpoint").and_then(|v| v.as_bool()).unwrap_or(false),
        version: manifest.get("version").and_then(|v| v.as_str()).unwrap_or("1.0.0").to_string(),
        changelog: manifest.get("changelog").and_then(|v| v.as_str()).unwrap_or("최초 릴리즈").to_string(),
        bundler_protocol_version,
        target_age,
        category,
        tags,
        license,
        license_file,
        author,
        toc: JsonValue::Array(toc_array.clone()),
        cards,
        wiki,
        manifest_thumbnail: manifest.get("thumbnail").and_then(|v| v.as_str()).map(str::to_string),
        entries,
    })
}

fn read_zip_entries(zip_bytes: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let reader = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("ZIP 파싱 실패: {e}"))?;

    let mut entries = BTreeMap::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("ZIP 파싱 실패: {e}"))?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().replace('\\', "/");
        let mut buf = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut buf).map_err(|e| format!("ZIP 읽기 실패 ({name}): {e}"))?;
        entries.insert(name, buf);
    }
    Ok(entries)
}

fn is_valid_target_age(s: &str) -> bool {
    if s == "all" {
        return true;
    }
    if let Some(stripped) = s.strip_suffix('+') {
        return !stripped.is_empty() && stripped.chars().all(|c| c.is_ascii_digit());
    }
    if let Some((a, b)) = s.split_once('-') {
        return !a.is_empty() && !b.is_empty() && a.chars().all(|c| c.is_ascii_digit()) && b.chars().all(|c| c.is_ascii_digit());
    }
    !s.is_empty() && s.chars().all(|c| c.is_ascii_digit())
}

fn strip_card_ext(filename: &str) -> String {
    for ext in [".mdx", ".md", ".json"] {
        if let Some(stripped) = filename.strip_suffix(ext) {
            return stripped.to_string();
        }
    }
    filename.to_string()
}

fn slugify(title: &str) -> String {
    let lower = title.to_lowercase();
    let mut collapsed = String::new();
    let mut last_was_sep = false;
    for c in lower.chars() {
        if c.is_whitespace() || c == '_' {
            if !last_was_sep {
                collapsed.push('-');
                last_was_sep = true;
            }
        } else {
            collapsed.push(c);
            last_was_sep = false;
        }
    }
    collapsed.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect()
}

const DEFAULT_DESCRIPTION_PLACEHOLDER: &str = "강좌 상세 카드를 확인하세요.";

fn validate_toc_recursive(nodes: &[JsonValue], path: &str, collected: &mut Vec<String>) -> Result<(), String> {
    for (i, node) in nodes.iter().enumerate() {
        let current_path = format!("{path}[{i}]");

        let node_type = node.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if !["chapter", "section", "subsection"].contains(&node_type) {
            return Err(format!(
                "{current_path} 항목에 유효하지 않거나 누락된 type이 있습니다. ('chapter', 'section', 'subsection' 중 하나여야 합니다.)"
            ));
        }

        let title = node.get("title").and_then(|v| v.as_str()).map(str::trim).unwrap_or("");
        if title.is_empty() {
            return Err(format!("{current_path} 항목에 title이 누락되었습니다."));
        }

        let description = node.get("description").and_then(|v| v.as_str()).map(str::trim).unwrap_or("");
        if description.is_empty() {
            return Err(format!("{current_path} 항목에 description이 누락되었습니다."));
        }

        let filename = node.get("filename").and_then(|v| v.as_str());
        let clean_filename = filename.map(strip_card_ext).unwrap_or_default();
        if title == clean_filename {
            return Err(format!(
                "{current_path} 항목의 제목이 파일명('{clean_filename}')과 동일합니다. 사용자가 읽기 좋은 적절한 한글 제목으로 수정해주세요."
            ));
        }

        if description == DEFAULT_DESCRIPTION_PLACEHOLDER {
            return Err(format!(
                "{current_path} 항목의 요약 설명이 기본값('강좌 상세 카드를 확인하세요.')으로 방치되어 있습니다. 적절한 설명을 작성해주세요."
            ));
        }

        if let Some(f) = filename {
            collected.push(f.to_string());
        }

        if let Some(children_val) = node.get("children") {
            let children = children_val
                .as_array()
                .ok_or_else(|| format!("{current_path} 항목의 children이 배열이 아닙니다."))?;
            validate_toc_recursive(children, &format!("{current_path}.children"), collected)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn build_zip(files: &[(&str, &str)]) -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let cursor = std::io::Cursor::new(&mut buf);
            let mut writer = zip::ZipWriter::new(cursor);
            let options = SimpleFileOptions::default();
            for (name, content) in files {
                writer.start_file(*name, options).unwrap();
                writer.write_all(content.as_bytes()).unwrap();
            }
            writer.finish().unwrap();
        }
        buf
    }

    fn valid_manifest() -> &'static str {
        r#"{
            "title": "테스트 강좌",
            "author": { "nickname": "tester" },
            "bundler_protocol_version": "1.1.5",
            "target_age": "all",
            "category": "Programming"
        }"#
    }

    fn valid_config() -> &'static str {
        r#"{
            "cards": ["01_intro.md"],
            "toc": [
                {
                    "type": "section",
                    "title": "1강. 오리엔테이션",
                    "description": "강좌 소개와 학습 목표를 설명합니다.",
                    "filename": "01_intro.md"
                }
            ]
        }"#
    }

    fn minimal_valid_zip() -> Vec<u8> {
        build_zip(&[
            ("package-manifest.json", valid_manifest()),
            ("config.json", valid_config()),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
        ])
    }

    #[test]
    fn validates_minimal_bundle_successfully() {
        let zip_bytes = minimal_valid_zip();
        let result = validate(&zip_bytes).expect("should validate");
        assert_eq!(result.slug, "테스트-강좌".chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect::<String>());
    }

    #[test]
    fn explicit_slug_is_used_verbatim() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", r#"{
                "title": "테스트 강좌", "slug": "my-course",
                "author": { "nickname": "tester" },
                "bundler_protocol_version": "1.1.5", "target_age": "all", "category": "Programming"
            }"#),
            ("config.json", valid_config()),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
        ]);
        let result = validate(&zip_bytes).unwrap();
        assert_eq!(result.slug, "my-course");
    }

    #[test]
    fn missing_manifest_fails() {
        let zip_bytes = build_zip(&[("config.json", valid_config())]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("package-manifest.json"));
    }

    #[test]
    fn nested_root_folder_is_rejected() {
        let zip_bytes = build_zip(&[
            ("my-course/package-manifest.json", valid_manifest()),
            ("my-course/config.json", valid_config()),
            ("my-course/wiki.md", "# Wiki"),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("package-manifest.json"));
    }

    #[test]
    fn missing_author_nickname_fails() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", r#"{
                "title": "T", "author": {},
                "bundler_protocol_version": "1.1.5", "target_age": "all", "category": "Programming"
            }"#),
            ("config.json", valid_config()),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("author.nickname"));
    }

    #[test]
    fn invalid_target_age_fails() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", r#"{
                "title": "T", "author": {"nickname":"tester"},
                "bundler_protocol_version": "1.1.5", "target_age": "grownups", "category": "Programming"
            }"#),
            ("config.json", valid_config()),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("target_age"));
    }

    #[test]
    fn title_matching_filename_fails() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", valid_manifest()),
            (
                "config.json",
                r#"{ "cards": ["01_intro.md"], "toc": [
                    { "type": "section", "title": "01_intro", "description": "desc here", "filename": "01_intro.md" }
                ]}"#,
            ),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("파일명"));
    }

    #[test]
    fn placeholder_description_fails() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", valid_manifest()),
            (
                "config.json",
                r#"{ "cards": ["01_intro.md"], "toc": [
                    { "type": "section", "title": "1강. 오리엔테이션", "description": "강좌 상세 카드를 확인하세요.", "filename": "01_intro.md" }
                ]}"#,
            ),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("기본값"));
    }

    #[test]
    fn card_missing_from_zip_fails() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", valid_manifest()),
            ("config.json", valid_config()),
            ("wiki.md", "# Wiki"),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("실제 존재하지"));
    }

    #[test]
    fn toc_card_count_mismatch_fails() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", valid_manifest()),
            (
                "config.json",
                r#"{ "cards": ["01_intro.md", "02_extra.md"], "toc": [
                    { "type": "section", "title": "1강. 오리엔테이션", "description": "desc", "filename": "01_intro.md" }
                ]}"#,
            ),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
            ("cards/02_extra.md", "# Extra"),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("일치하지 않습니다"));
    }

    #[test]
    fn video_card_missing_video_info_fails() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", valid_manifest()),
            (
                "config.json",
                r#"{ "cards": ["01_video.json"], "toc": [
                    { "type": "section", "title": "1강. 영상", "description": "desc", "filename": "01_video.json" }
                ]}"#,
            ),
            ("wiki.md", "# Wiki"),
            ("cards/01_video.json", r#"{ "title": "영상", "type": "video" }"#),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("video_info"));
    }

    #[test]
    fn valid_video_card_passes() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", valid_manifest()),
            (
                "config.json",
                r#"{ "cards": ["01_video.json"], "toc": [
                    { "type": "section", "title": "1강. 영상", "description": "desc", "filename": "01_video.json" }
                ]}"#,
            ),
            ("wiki.md", "# Wiki"),
            (
                "cards/01_video.json",
                r#"{ "title": "영상", "type": "video", "video_info": { "provider": "youtube", "video_id": "abc123" } }"#,
            ),
        ]);
        let result = validate(&zip_bytes);
        assert!(result.is_ok(), "expected ok, got {:?}", result.err());
    }

    #[test]
    fn custom_license_without_file_fails() {
        let zip_bytes = build_zip(&[
            (
                "package-manifest.json",
                r#"{
                "title": "T", "author": {"nickname":"tester"},
                "bundler_protocol_version": "1.1.5", "target_age": "all", "category": "Programming",
                "license": "custom"
            }"#,
            ),
            ("config.json", valid_config()),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("license_file"));
    }

    #[test]
    fn duplicate_card_filenames_in_cards_array_fails() {
        let zip_bytes = build_zip(&[
            ("package-manifest.json", valid_manifest()),
            (
                "config.json",
                r#"{ "cards": ["01_intro.md", "01_intro.md"], "toc": [
                    { "type": "section", "title": "1강. 오리엔테이션", "description": "desc", "filename": "01_intro.md" }
                ]}"#,
            ),
            ("wiki.md", "# Wiki"),
            ("cards/01_intro.md", "# Intro"),
        ]);
        let err = validate(&zip_bytes).unwrap_err();
        assert!(err.contains("중복"));
    }
}
